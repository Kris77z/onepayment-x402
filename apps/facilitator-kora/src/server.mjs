import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { PublicKey, Transaction } from '@solana/web3.js';
import {
  ErrorReasons,
  createVerifyResponse,
  createSettleResponse,
} from './types.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 先加载仓库根目录 `.env`，再加载本目录 `.env` 以便局部覆盖
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const app = express();
app.use(express.json({ limit: '1mb' }));

const {
  KORA_RPC_URL: KORA_RPC_URL_RAW = 'http://localhost:8080',
  KORA_API_KEY,
  KORA_HMAC_SECRET,
  KORA_SIGNER_ADDRESS,
  NEXT_PUBLIC_RECEIVER_ADDRESS,
  NEXT_PUBLIC_NETWORK = 'solana-devnet',
  USDC_MINT,
  REQUEST_TIMEOUT_MS = '30000'
} = process.env;

// 将 localhost 转换为 127.0.0.1，避免 Node.js fetch 的连接问题
const KORA_RPC_URL = KORA_RPC_URL_RAW.replace('localhost', '127.0.0.1');

const REQUEST_TIMEOUT = Number.parseInt(REQUEST_TIMEOUT_MS, 10) || 30000;
const SERVICE_STARTED_AT = new Date().toISOString();

if (!KORA_RPC_URL) {
  throw new Error('KORA_RPC_URL 未配置，无法启动 Facilitator 服务');
}

if (!NEXT_PUBLIC_RECEIVER_ADDRESS) {
  throw new Error('NEXT_PUBLIC_RECEIVER_ADDRESS 未配置，无法验证支付请求');
}

function buildStructuredData(payload) {
  return {
    domain: {
      name: 'x402-solana-protocol',
      version: '1',
      chainId: NEXT_PUBLIC_NETWORK,
      verifyingContract: 'x402-sol'
    },
    types: {
      AuthorizationPayload: [
        { name: 'amount', type: 'string' },
        { name: 'recipient', type: 'string' },
        { name: 'resourceId', type: 'string' },
        { name: 'resourceUrl', type: 'string' },
        { name: 'nonce', type: 'string' },
        { name: 'timestamp', type: 'uint64' },
        { name: 'expiry', type: 'uint64' }
      ]
    },
    primaryType: 'AuthorizationPayload',
    message: {
      amount: payload.amount,
      recipient: payload.recipient,
      resourceId: payload.resourceId,
      resourceUrl: payload.resourceUrl,
      nonce: payload.nonce,
      timestamp: payload.timestamp,
      expiry: payload.expiry
    }
  };
}

function parsePaymentRequest(raw) {
  if (!raw) {
    throw new Error('缺少 paymentRequest');
  }

  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('paymentRequest 字符串解析失败');
    }
  }

  const { payload, signature, clientPublicKey, signedTransaction } = parsed;
  if (!payload || !signature || !clientPublicKey || !signedTransaction) {
    throw new Error('paymentRequest 缺少必要字段');
  }

  return {
    payload,
    signature,
    clientPublicKey,
    signedTransaction
  };
}

/**
 * 验证 payload（借鉴 PayAI 的错误处理模式）
 * @throws {Error} 包含标准错误码的错误
 */
function verifyPayload(payload) {
  const now = Date.now();
  const expiry = Number.parseInt(payload.expiry, 10);
  const timestamp = Number.parseInt(payload.timestamp, 10);

  if (!payload.recipient || payload.recipient !== NEXT_PUBLIC_RECEIVER_ADDRESS) {
    const error = new Error('支付目标地址与配置不一致');
    error.code = ErrorReasons.INVALID_RECIPIENT;
    throw error;
  }

  if (!payload.amount || BigInt(payload.amount) <= 0n) {
    const error = new Error('支付金额无效');
    error.code = ErrorReasons.INVALID_AMOUNT;
    throw error;
  }

  if (Number.isFinite(expiry) && expiry < now) {
    const error = new Error('支付请求已过期');
    error.code = ErrorReasons.EXPIRED;
    throw error;
  }

  if (Number.isFinite(timestamp) && Math.abs(now - timestamp) > 1000 * 60 * 10) {
    const error = new Error('支付请求时间戳超出允许范围');
    error.code = ErrorReasons.INVALID_TIMESTAMP;
    throw error;
  }
}

/**
 * 验证签名（借鉴 PayAI 的错误处理模式）
 * @throws {Error} 包含标准错误码的错误
 */
function verifySignature({ payload, signature, clientPublicKey }) {
  let publicKeyBytes;
  try {
    publicKeyBytes = new PublicKey(clientPublicKey).toBytes();
  } catch {
    const error = new Error('clientPublicKey 无法解析为有效的公钥');
    error.code = ErrorReasons.INVALID_PAYLOAD;
    throw error;
  }

  const structuredData = buildStructuredData(payload);
  const message = Buffer.from(JSON.stringify(structuredData), 'utf-8');
  let signatureBytes;

  try {
    signatureBytes = bs58.decode(signature);
  } catch {
    const error = new Error('签名不是有效的 base58 字符串');
    error.code = ErrorReasons.INVALID_SIGNATURE;
    throw error;
  }

  const ok = nacl.sign.detached.verify(message, signatureBytes, publicKeyBytes);
  if (!ok) {
    const error = new Error('签名验证失败');
    error.code = ErrorReasons.INVALID_SIGNATURE;
    throw error;
  }
}

/**
 * 检查交易（借鉴 PayAI 的错误处理模式）
 * @throws {Error} 包含标准错误码的错误
 */
function inspectTransaction(base64Tx) {
  try {
    const tx = Transaction.from(Buffer.from(base64Tx, 'base64'));
    return tx;
  } catch {
    const error = new Error('无法解析 signedTransaction');
    error.code = ErrorReasons.INVALID_TRANSACTION;
    throw error;
  }
}

async function callKoraRpc(method, params) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  const headers = { 'Content-Type': 'application/json' };
  if (KORA_API_KEY) {
    headers['x-api-key'] = KORA_API_KEY;
  }
  if (KORA_HMAC_SECRET) {
    headers['x-hmac-signature'] = KORA_HMAC_SECRET;
  }

  try {
    const response = await fetch(KORA_RPC_URL, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Kora RPC] HTTP 错误 ${response.status}: ${errorText}`);
      throw new Error(`Kora RPC HTTP ${response.status}: ${errorText}`);
    }

    const json = await response.json();
    if (json.error) {
      const errorMsg = json.error.message ?? 'Kora RPC 返回错误';
      const errorCode = json.error.code ?? 'unknown';
      console.error(`[Kora RPC] 错误 ${errorCode}: ${errorMsg}`);
      throw new Error(`Kora RPC 错误 (${errorCode}): ${errorMsg}`);
    }
    return json.result;
  } catch (error) {
    // 如果是 AbortError（超时），提供更清晰的错误信息
    if (error.name === 'AbortError') {
      throw new Error(`Kora RPC 请求超时（${REQUEST_TIMEOUT}ms）`);
    }
    // 如果是网络错误，提供更清晰的错误信息
    if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
      throw new Error(`无法连接到 Kora RPC (${KORA_RPC_URL}): ${error.message}`);
    }
    // 其他错误直接抛出
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    network: NEXT_PUBLIC_NETWORK,
    feePayer: KORA_SIGNER_ADDRESS ?? null,
    startedAt: SERVICE_STARTED_AT
  });
});

// 标准 x402 端点：/.well-known/x402/supported-payment-kinds
app.get('/.well-known/x402/supported-payment-kinds', (req, res) => {
  res.json({
    protocol: 'x402',
    version: '1.0',
    paymentKinds: {
      'solana-exact': {
        scheme: 'exact',
        network: NEXT_PUBLIC_NETWORK,
        asset: USDC_MINT ?? null,
        payTo: NEXT_PUBLIC_RECEIVER_ADDRESS,
        feePayer: KORA_SIGNER_ADDRESS ?? null,
        decimals: 6
      }
    }
  });
});

// PayAI Network 兼容端点：/supported（x402-next 库可能使用此路径）
app.get('/supported', (req, res) => {
  res.json({
    kinds: [
      {
        x402Version: 1,
        scheme: 'exact',
        network: NEXT_PUBLIC_NETWORK,
        extra: {
          feePayer: KORA_SIGNER_ADDRESS ?? null,
          asset: USDC_MINT ?? null,
          payTo: NEXT_PUBLIC_RECEIVER_ADDRESS,
          decimals: 6
        }
      }
    ]
  });
});

/**
 * Verify 端点（借鉴 PayAI Network facilitator 的设计）
 * - 即使验证失败也返回 200，但 isValid: false（便于客户端统一处理）
 * - 提供标准化的错误码和错误消息
 */
app.post('/verify', (req, res) => {
  try {
    const { paymentRequest } = req.body ?? {};
    const parsed = parsePaymentRequest(paymentRequest);
    verifyPayload(parsed.payload);
    verifySignature(parsed);
    inspectTransaction(parsed.signedTransaction);

    // 验证成功：返回 isValid: true
    const response = createVerifyResponse(true);
    res.status(200).json(response);
  } catch (error) {
    // 验证失败：返回 200，但 isValid: false（借鉴 PayAI 模式）
    const errorReason = error.code || ErrorReasons.UNEXPECTED_ERROR;
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    const response = createVerifyResponse(false, errorReason, errorMessage);
    res.status(200).json(response);
  }
});

/**
 * Settle 端点（借鉴 PayAI Network facilitator 的设计）
 * - 提供标准化的响应格式
 * - 区分验证错误和网络错误
 */
app.post('/settle', async (req, res) => {
  try {
    const { paymentRequest } = req.body ?? {};
    const parsed = parsePaymentRequest(paymentRequest);
    verifyPayload(parsed.payload);
    verifySignature(parsed);
    inspectTransaction(parsed.signedTransaction);

    // 调用 Kora RPC 提交交易
    const result = await callKoraRpc('signAndSendTransaction', [parsed.signedTransaction]);
    const signature = result?.signature ?? null;

    if (!signature) {
      const response = createSettleResponse(
        'error',
        null,
        ErrorReasons.NETWORK_ERROR,
        'Kora RPC 未返回交易签名'
      );
      return res.status(200).json(response);
    }

    // 结算成功
    const response = createSettleResponse('settled', signature);
    res.status(200).json(response);
  } catch (error) {
    // 结算失败：返回 200，但 status: 'error'（借鉴 PayAI 模式）
    const errorReason = error.code || ErrorReasons.UNEXPECTED_ERROR;
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    const response = createSettleResponse('error', null, errorReason, errorMessage);
    res.status(200).json(response);
  }
});

const PORT = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 3001;

app.listen(PORT, () => {
  console.log(`Kora Facilitator listening on http://localhost:${PORT}`);
  console.log(`→ Kora RPC       : ${KORA_RPC_URL}`);
  console.log(`→ Receiver       : ${NEXT_PUBLIC_RECEIVER_ADDRESS}`);
  console.log(`→ Fee payer      : ${KORA_SIGNER_ADDRESS ?? '未配置'}`);
});

