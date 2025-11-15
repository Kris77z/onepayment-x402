#!/usr/bin/env node

/**
 * Facilitator Flow Test - 验证 x402 支付流程
 *
 * 流程概览：
 * 1. 向受保护资源发起请求，获取 402 Payment Requirement
 * 2. 按 Gill 模板规范构造 paymentRequest（签名 payload + 客户端签名交易）
 * 3. 调用 Facilitator /verify 验证签名与 nonce
 * 4. 调用 Facilitator /settle 完成结算（SIMULATE_TRANSACTIONS 模式下返回模拟签名）
 */

import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { Connection, PublicKey, SystemProgram, Transaction, Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import crypto from 'crypto';

config();

const FACILITATOR_URL = process.env.FACILITATOR_URL || 'http://localhost:3001';
const SERVER_URL = process.env.SERVER_URL || process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';
const RESOURCE_PATH = '/api/premium-data';
const MERCHANT_ADDRESS = process.env.MERCHANT_SOLANA_ADDRESS;
const FACILITATOR_PRIVATE_KEY = process.env.FACILITATOR_PRIVATE_KEY;
const FACILITATOR_PUBLIC_KEY = process.env.FACILITATOR_PUBLIC_KEY;
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const CLIENT_KEYPAIR_PATH = process.env.CLIENT_KEYPAIR_PATH || path.resolve(process.cwd(), 'test-client-keypair.json');
const EXPORT_ONLY = process.argv.includes('--export-only') || process.argv.includes('--no-settle');
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';
const PAYMENT_SESSION_AMOUNT = Number.parseInt(process.env.PAYMENT_SESSION_AMOUNT ?? '10000000', 10);
const EXISTING_SESSION_ID = process.env.PAYMENT_SESSION_ID;
const EXISTING_SESSION_NONCE = process.env.PAYMENT_SESSION_NONCE;

async function fetchQuoteFromBackend(amount, currency) {
  console.log(`🌐 请求报价: ${API_BASE_URL}/api/payments/quote`);
  const res = await fetch(`${API_BASE_URL}/api/payments/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, currency })
  });
  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`获取报价失败: ${res.status} ${res.statusText}\n${errorBody}`);
  }
  const json = await res.json();
  if (!json.success || !json.data) {
    throw new Error(`报价响应异常: ${JSON.stringify(json.error ?? json)}`);
  }
  console.log('💡 报价成功:', json.data);
  return json.data;
}

async function createPaymentSessionOnBackend({ amount, currency, quoteId, memo }) {
  console.log(`🌐 调用后端 API 创建支付会话: ${API_BASE_URL}/api/payments/session`);
  const response = await fetch(`${API_BASE_URL}/api/payments/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, currency, quoteId, memo })
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`创建会话失败: ${response.status} ${response.statusText}\n${errorBody}`);
  }
  const data = await response.json();
  console.log('💡 会话创建成功:', data.data);
  return data.data;
}

async function fetchSessionStatus(sessionId) {
  console.log(`🌐 查询会话状态: ${API_BASE_URL}/api/payments/${sessionId}/status`);
  const res = await fetch(`${API_BASE_URL}/api/payments/${sessionId}/status`);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`无法解析会话状态响应：${text}`);
  }

  if (!res.ok || !json.success) {
    throw new Error(`获取会话状态失败: ${JSON.stringify(json.error ?? json)}`);
  }

  return json.data;
}

function printCommissionSummary(sessionId, statusData) {
  const settlement = statusData?.settlement;
  const commission = settlement?.commissionTransfer;

  console.log('\n📊 结算摘要（来自后端）');
  console.log('----------------------------------------');
  console.log(`Session ID: ${sessionId}`);
  console.log(`状态: ${statusData?.status ?? 'unknown'}`);
  console.log(`结算更新时间: ${statusData?.updatedAt ?? 'N/A'}`);

  if (!commission) {
    console.log('佣金信息: 未记录（Commission Transfer 缺失）');
    return;
  }

  console.log('佣金拆分:');
  console.log(`  - 状态: ${commission.status}`);
  console.log(`  - 佣金金额 (最小单位): ${commission.amount}`);
  console.log(`  - 佣金目标账户: ${commission.destination?.gridAccountId ?? 'N/A'}`);
  console.log(`  - 可重试: ${commission.retryAvailable ? '是' : '否'}`);
  console.log(`  - 最近错误: ${commission.latestError ?? '无'}`);

  const latestAttempt = commission.attempts[commission.attempts.length - 1];
  if (latestAttempt) {
    console.log('最近一次佣金 Intent 尝试:');
    console.log(`  - Attempt ID: ${latestAttempt.attemptId}`);
    console.log(`  - Status: ${latestAttempt.status}`);
    console.log(`  - Requested At: ${latestAttempt.requestedAt}`);
    console.log(`  - Completed At: ${latestAttempt.completedAt ?? '未完成'}`);
    console.log(`  - Intent ID: ${latestAttempt.gridTransferId ?? 'N/A'}`);
    console.log(`  - Signature: ${latestAttempt.solanaTxSignature ?? 'N/A'}`);
    if (latestAttempt.errorMessage) {
      console.log(`  - Error: ${latestAttempt.errorMessage}`);
    }
  }

  if (commission.intentSnapshot) {
    console.log('佣金 Payment Intent Snapshot:');
    console.log(`  - Intent ID: ${commission.intentSnapshot.id}`);
    console.log(`  - Status: ${commission.intentSnapshot.status}`);
    console.log(`  - Created At: ${commission.intentSnapshot.createdAt ?? 'N/A'}`);
    console.log(`  - Valid Until: ${commission.intentSnapshot.validUntil ?? 'N/A'}`);
    console.log(`  - Signers: ${commission.intentSnapshot.transactionSigners.join(', ') || '无'}`);
  }

  if (commission.retryAvailable) {
    console.log('\n🔁 可执行佣金重试:');
    console.log(`   curl -X POST ${API_BASE_URL}/api/payments/${sessionId}/commission/retry`);
  }
  console.log('----------------------------------------\n');
}

if (!MERCHANT_ADDRESS || !FACILITATOR_PRIVATE_KEY) {
  console.error('❌ 缺少必要环境变量: MERCHANT_SOLANA_ADDRESS 或 FACILITATOR_PRIVATE_KEY');
  process.exit(1);
}

let facilitatorKeypair;
try {
  const secretBytes = bs58.decode(FACILITATOR_PRIVATE_KEY);
  facilitatorKeypair = Keypair.fromSecretKey(secretBytes);
} catch (error) {
  console.error('❌ FACILITATOR_PRIVATE_KEY 解码失败，请确认为 base58 编码的 64 字节私钥');
  if (error instanceof Error) {
    console.error(error.message);
  }
  process.exit(1);
}

const facilitatorPublicKey = FACILITATOR_PUBLIC_KEY || facilitatorKeypair.publicKey.toString();

function loadClientKeypair() {
  if (fs.existsSync(CLIENT_KEYPAIR_PATH)) {
    try {
      const file = fs.readFileSync(CLIENT_KEYPAIR_PATH, 'utf-8');
      const parsed = JSON.parse(file);
      const secretKeyBase58 = parsed.secretKey;
      if (!secretKeyBase58) {
        throw new Error('secretKey 缺失');
      }
      const secretBytes = bs58.decode(secretKeyBase58);
      const keypair = Keypair.fromSecretKey(secretBytes);
      console.log(`📂 使用现有测试客户端密钥：${CLIENT_KEYPAIR_PATH}`);
      return keypair;
    } catch (error) {
      console.warn('⚠️ 读取测试客户端密钥失败，将生成新的临时地址。', error instanceof Error ? error.message : error);
    }
  }

  const generated = Keypair.generate();
  console.log('⚠️ 未找到固定测试客户端密钥，已生成临时地址（记得手动空投或保存）。');
  console.log(`   临时客户端地址：${generated.publicKey.toString()}`);
  return generated;
}

console.log('🚀 开始 Facilitator 流程测试');
console.log('='.repeat(60));
console.log(`Facilitator URL: ${FACILITATOR_URL}`);
console.log(`Server URL: ${SERVER_URL}`);
console.log(`Protected Resource: ${RESOURCE_PATH}`);
console.log(`Merchant Address: ${MERCHANT_ADDRESS}`);
console.log(`Facilitator Public Key: ${facilitatorPublicKey}`);
console.log(`RPC URL: ${RPC_URL}`);
console.log();

const clientKeypair = loadClientKeypair();
console.log(`📱 当前测试客户端: ${clientKeypair.publicKey.toString()}`);

const connection = new Connection(RPC_URL, 'confirmed');

async function fetchPaymentRequirement() {
  console.log('🔎 请求受保护资源，获取支付要求 (HTTP 402)...');
  const response = await fetch(`${SERVER_URL}${RESOURCE_PATH}`);
  const bodyText = await response.text();

  if (response.status !== 402) {
    throw new Error(`预期收到 402 Payment Required，实际响应 ${response.status}: ${bodyText}`);
  }

  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch (error) {
    throw new Error(`无法解析 402 响应 JSON: ${bodyText}`);
  }

  const requirement = payload.accepts && payload.accepts[0];
  if (!requirement) {
    throw new Error('402 响应中缺少 accepts[0]，无法获取支付配置');
  }

  console.log('💡 支付要求:', requirement);
  return requirement;
}

function writePaymentRequestFile(sessionId, paymentRequest) {
  const filePath = path.resolve('curl-settle-body.json');
  const content = {
    sessionId,
    paymentRequest
  };
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
  console.log(`📄 已写入 ${filePath}`);
}

function buildStructuredData(payload) {
  // 使用与 facilitator 一致的 network 值
  const network = process.env.NEXT_PUBLIC_NETWORK || 'solana-devnet';
  return {
    domain: {
      name: 'x402-solana-protocol',
      version: '1',
      chainId: network, // 使用与 facilitator 一致的 network
      verifyingContract: 'x402-sol',
    },
    types: {
      AuthorizationPayload: [
        { name: 'amount', type: 'string' },
        { name: 'recipient', type: 'string' },
        { name: 'resourceId', type: 'string' },
        { name: 'resourceUrl', type: 'string' },
        { name: 'nonce', type: 'string' },
        { name: 'timestamp', type: 'uint64' },
        { name: 'expiry', type: 'uint64' },
      ],
    },
    primaryType: 'AuthorizationPayload',
    message: {
      amount: payload.amount,
      recipient: payload.recipient,
      resourceId: payload.resourceId,
      resourceUrl: payload.resourceUrl,
      nonce: payload.nonce,
      timestamp: payload.timestamp,
      expiry: payload.expiry,
    },
  };
}

async function createPaymentRequest(params) {
  const { amountLamports, recipient, resource, nonceOverride } = params;

  const amountString = BigInt(amountLamports).toString();
  const nonce = nonceOverride ?? crypto.randomBytes(32).toString('hex');
  const timestamp = Date.now();
  const expiry = timestamp + 60 * 60 * 1000;

  const payload = {
    amount: amountString,
    recipient,
    resourceId: resource,
    resourceUrl: resource,
    nonce,
    timestamp,
    expiry,
  };

  const structuredData = buildStructuredData(payload);
  const messageBytes = Buffer.from(JSON.stringify(structuredData), 'utf-8');
  const signatureBytes = nacl.sign.detached(messageBytes, clientKeypair.secretKey);
  const signature = bs58.encode(signatureBytes);

  console.log('🧾 构造 paymentRequest:');
  console.log(`   Amount: ${Number(amountLamports) / 1e9} SOL (${amountString} lamports)`);
  console.log(`   Recipient: ${recipient}`);
  console.log(`   Nonce: ${nonce}`);
  console.log(`   Expiry: ${new Date(expiry).toISOString()}`);

  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  const transaction = new Transaction({
    feePayer: new PublicKey(facilitatorPublicKey),
    recentBlockhash: blockhash,
  });

  transaction.add(
    SystemProgram.transfer({
      fromPubkey: clientKeypair.publicKey,
      toPubkey: new PublicKey(recipient),
      lamports: Number(amountLamports),
    })
  );

  transaction.sign(clientKeypair);
  const serializedTx = transaction.serialize({ requireAllSignatures: false }).toString('base64');

  const paymentRequest = {
    payload,
    signature,
    clientPublicKey: clientKeypair.publicKey.toString(),
    signedTransaction: serializedTx,
  };

  return {
    paymentRequest,
    metadata: { nonce, timestamp, expiry },
  };
}

async function callFacilitator(path, paymentRequest) {
  const response = await fetch(`${FACILITATOR_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ paymentRequest: JSON.stringify(paymentRequest) }),
  });

  const text = await response.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch (error) {
    // 保留原始文本
  }

  if (!response.ok) {
    throw new Error(`${path} 调用失败: ${response.status} ${response.statusText} ${text}`);
  }

  return data;
}

async function testFacilitatorFlow() {
  try {
    let sessionData = null;
    let sessionNonce = null;
    let quoteData = null;

    if (EXISTING_SESSION_ID && EXISTING_SESSION_NONCE) {
      sessionData = {
        sessionId: EXISTING_SESSION_ID,
        nonce: EXISTING_SESSION_NONCE,
        facilitatorUrl: FACILITATOR_URL,
        merchantAddress: MERCHANT_ADDRESS
      };
      sessionNonce = EXISTING_SESSION_NONCE;
      console.log(`📝 使用已有会话: ${EXISTING_SESSION_ID}`);
    } else {
      quoteData = await fetchQuoteFromBackend(PAYMENT_SESSION_AMOUNT, 'USDC');
      sessionData = await createPaymentSessionOnBackend({
        amount: quoteData.inputAmount,
        currency: quoteData.currency,
        quoteId: quoteData.quoteId,
        memo: `auto-session-${Date.now()}`
      });
      sessionNonce = sessionData.nonce;
      console.log('🧾 新创建的会话:', sessionData);
    }

    const requirement = await fetchPaymentRequirement();
    const amountLamports =
      quoteData?.inputAmount?.toString() ??
      requirement.maxAmountRequired ??
      String(PAYMENT_SESSION_AMOUNT);
    const recipient = requirement.payTo || MERCHANT_ADDRESS;
    const resource = requirement.resource || RESOURCE_PATH;

    if (recipient !== MERCHANT_ADDRESS) {
      console.warn('⚠️ 受保护资源返回的收款地址与环境变量中的 MERCHANT_SOLANA_ADDRESS 不一致，请确认配置。');
    }

    const { paymentRequest } = await createPaymentRequest({
      amountLamports,
      recipient,
      resource,
      nonceOverride: sessionNonce
    });

    if (EXPORT_ONLY && sessionData) {
      writePaymentRequestFile(sessionData.sessionId, paymentRequest);
      console.log('✅ 已生成 paymentRequest 并写入 curl-settle-body.json');
      console.log('');
      
      console.log('🚀 自动调用 /api/payments/settle...');
      const settleResponse = await fetch(`${API_BASE_URL}/api/payments/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionData.sessionId,
          paymentRequest
        })
      });

      const settleText = await settleResponse.text();
      let settleJson;
      try {
        settleJson = JSON.parse(settleText);
      } catch (error) {
        throw new Error(`无法解析 settle 响应：${settleText}`);
      }

      if (!settleResponse.ok || !settleJson.success) {
        throw new Error(`后端结算失败: ${JSON.stringify(settleJson.error ?? settleJson)}`);
      }

      console.log('✅ 后端结算成功:', JSON.stringify(settleJson, null, 2));
      const statusData = await fetchSessionStatus(sessionData.sessionId);
      printCommissionSummary(sessionData.sessionId, statusData);
      return;
    }

    console.log('\n✅ 步骤 1: 调用 Facilitator /verify');
    const verifyResult = await callFacilitator('/verify', paymentRequest);
    console.log('   响应:', JSON.stringify(verifyResult, null, 2));

    if (!verifyResult || !verifyResult.isValid) {
      throw new Error(`Verify 未通过: ${(verifyResult && verifyResult.error) || '未知错误'}`);
    }

    console.log('\n💸 步骤 2: 调用 Facilitator /settle');
    const settleResult = await callFacilitator('/settle', paymentRequest);
    console.log('   响应:', JSON.stringify(settleResult, null, 2));

    if (!settleResult || settleResult.status !== 'settled') {
      throw new Error(`Settle 未完成: ${(settleResult && (settleResult.error || settleResult.status)) || '未知错误'}`);
    }

    if (settleResult.transactionSignature) {
      console.log('🔗 交易签名:', settleResult.transactionSignature);
      console.log(`   Explorer: https://explorer.solana.com/tx/${settleResult.transactionSignature}?cluster=devnet`);
    } else {
      console.log('🧪 当前为模拟模式 (SIMULATE_TRANSACTIONS=true)，未提交真实链上交易。');
    }

    const statusData = await fetchSessionStatus(sessionData.sessionId);
    printCommissionSummary(sessionData.sessionId, statusData);

    console.log('\n🎉 Facilitator 流程测试完成！');
  } catch (error) {
    console.error('❌ 测试失败:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

await testFacilitatorFlow();
