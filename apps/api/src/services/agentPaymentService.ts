import {
  PublicKey,
  Connection,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
  Keypair,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createTransferCheckedInstruction,
  getMint,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { getConfig } from '../config.js';
import { verifyPaymentRequest, settlePaymentRequest } from './facilitatorService.js';
import type { AgentPaymentState } from '../stores/paymentSessionTypes.js';
import bs58 from 'bs58';

/**
 * Facilitator 支付配置（从 /supported 端点获取）
 */
interface FacilitatorPaymentConfig {
  x402Version: number;
  scheme: string;
  network: string;
  extra: {
    feePayer: string | null;
    asset: string | null;
    payTo: string;
    decimals: number;
  };
}

/**
 * 获取 Facilitator 的支付配置
 */
async function getFacilitatorPaymentConfig(): Promise<FacilitatorPaymentConfig> {
  const { FACILITATOR_URL, REQUEST_TIMEOUT_MS } = getConfig();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(new URL('/supported', FACILITATOR_URL), {
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Failed to fetch facilitator config: ${res.status} ${res.statusText}`);
    }

    const json = await res.json();
    const kinds = json.kinds as FacilitatorPaymentConfig[];

    if (!kinds || kinds.length === 0) {
      throw new Error('No payment kinds available from facilitator');
    }

    // 选择第一个 Solana 配置
    const solanaConfig = kinds.find(
      (k) => k.network === 'solana-devnet' || k.network === 'solana'
    );

    if (!solanaConfig) {
      throw new Error('No Solana payment config found');
    }

    return solanaConfig;
  } catch (error) {
    clearTimeout(timeout);
    throw error instanceof Error
      ? error
      : new Error('Unknown error fetching facilitator config');
  }
}

/**
 * 创建 Agent 支付交易并签名
 */
async function createAgentPaymentTransaction(
  agentKeypair: Keypair,
  config: FacilitatorPaymentConfig,
  amount: bigint,
  rpcUrl: string
): Promise<VersionedTransaction> {
  const connection = new Connection(rpcUrl, 'confirmed');

  if (!config.extra.feePayer) {
    throw new Error('Facilitator feePayer not available');
  }

  if (!config.extra.asset) {
    throw new Error('Payment asset (USDC mint) not configured');
  }

  const feePayerPubkey = new PublicKey(config.extra.feePayer);
  const agentPubkey = agentKeypair.publicKey;
  const destinationPubkey = new PublicKey(config.extra.payTo);
  const mintPubkey = new PublicKey(config.extra.asset);

  // 获取 mint 信息
  const mintInfo = await connection.getAccountInfo(mintPubkey, 'confirmed');
  if (!mintInfo) {
    throw new Error(`Mint ${config.extra.asset} not found`);
  }

  const programId = TOKEN_PROGRAM_ID;
  const mint = await getMint(connection, mintPubkey, undefined, programId);

  // 获取 Associated Token Accounts
  const sourceAta = await getAssociatedTokenAddress(
    mintPubkey,
    agentPubkey,
    false,
    programId
  );

  const destinationAta = await getAssociatedTokenAddress(
    mintPubkey,
    destinationPubkey,
    false,
    programId
  );

  // 检查源账户是否存在
  const sourceAtaInfo = await connection.getAccountInfo(sourceAta, 'confirmed');
  if (!sourceAtaInfo) {
    throw new Error(
      `Agent does not have an Associated Token Account for ${config.extra.asset}. Please fund the agent wallet first.`
    );
  }

  // 检查目标账户是否存在
  const destAtaInfo = await connection.getAccountInfo(destinationAta, 'confirmed');
  if (!destAtaInfo) {
    throw new Error(
      `Destination does not have an Associated Token Account for ${config.extra.asset}`
    );
  }

  // 构造交易指令
  const instructions = [];

  // ComputeBudget instructions (位置 0 和 1，x402 要求)
  instructions.push(
    ComputeBudgetProgram.setComputeUnitLimit({
      units: 7_000, // 足够 SPL token transfer
    })
  );

  instructions.push(
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 1, // 最小价格
    })
  );

  // TransferChecked instruction
  instructions.push(
    createTransferCheckedInstruction(
      sourceAta,
      mintPubkey,
      destinationAta,
      agentPubkey,
      amount,
      mint.decimals,
      [],
      programId
    )
  );

  // 获取最新 blockhash
  const { blockhash } = await connection.getLatestBlockhash('confirmed');

  // 创建 VersionedTransaction
  const message = new TransactionMessage({
    payerKey: feePayerPubkey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  const transaction = new VersionedTransaction(message);

  // Agent 签名交易
  transaction.sign([agentKeypair]);

  return transaction;
}

/**
 * 创建 x402 Payment Request header
 */
function createPaymentHeaderFromTransaction(
  transaction: VersionedTransaction,
  config: FacilitatorPaymentConfig
): string {
  // 序列化已签名的交易
  const serializedTransaction = Buffer.from(transaction.serialize()).toString('base64');

  // 创建 x402 payment payload
  const paymentPayload = {
    x402Version: config.x402Version,
    scheme: config.scheme,
    network: config.network,
    payload: {
      transaction: serializedTransaction,
    },
  };

  // 编码为 base64 X-PAYMENT header
  const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');

  return paymentHeader;
}

/**
 * Agent 通过 x402 协议向 Facilitator 支付费用
 * 
 * @param amount - 支付金额（原子单位，如 1000 = 0.001 USDC）
 * @returns Agent 支付状态
 */
export async function payFacilitatorFee(amount: number): Promise<AgentPaymentState> {
  const config = getConfig();
  const agentPrivateKey = process.env.RATE_AGENT_PRIVATE_KEY;

  // 检查 Agent 钱包配置
  if (!agentPrivateKey) {
    console.warn('[AgentPayment] RATE_AGENT_PRIVATE_KEY not configured, skipping payment');
    return {
      status: 'skipped',
      attemptedAt: new Date().toISOString(),
      amount,
      errorMessage: 'RATE_AGENT_PRIVATE_KEY not configured',
    };
  }

  // 检查支付金额
  if (amount <= 0) {
    console.warn('[AgentPayment] Payment amount is zero or negative, skipping');
    return {
      status: 'skipped',
      attemptedAt: new Date().toISOString(),
      amount,
      errorMessage: 'Payment amount is zero or negative',
    };
  }

  try {
    // 解析 Agent 私钥
    let agentKeypair: Keypair;
    try {
      const secretKey = bs58.decode(agentPrivateKey);
      agentKeypair = Keypair.fromSecretKey(secretKey);
    } catch (error) {
      throw new Error(`Invalid RATE_AGENT_PRIVATE_KEY format: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // 获取 Facilitator 支付配置
    const facilitatorConfig = await getFacilitatorPaymentConfig();

    // 获取 RPC URL
    const rpcUrl = config.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

    // 创建并签名支付交易
    const transaction = await createAgentPaymentTransaction(
      agentKeypair,
      facilitatorConfig,
      BigInt(amount),
      rpcUrl
    );

    // 创建 x402 Payment Request
    const paymentRequest = createPaymentHeaderFromTransaction(transaction, facilitatorConfig);

    // 调用 Facilitator verify
    const verifyResponse = await verifyPaymentRequest(paymentRequest);
    if (!verifyResponse.isValid) {
      const errorMsg = verifyResponse.invalidReason || verifyResponse.error || 'Verification failed';
      throw new Error(`Facilitator verification failed: ${errorMsg}`);
    }

    // 调用 Facilitator settle
    const settleResponse = await settlePaymentRequest(paymentRequest);
    if (settleResponse.status !== 'settled') {
      const errorMsg = settleResponse.errorReason || settleResponse.error || 'Settlement failed';
      throw new Error(`Facilitator settlement failed: ${errorMsg}`);
    }

    const completedAt = new Date().toISOString();

    console.log(
      `[AgentPayment] ✅ Successfully paid ${amount} atomic units to facilitator. Transaction: ${settleResponse.transactionSignature || 'N/A'}`
    );

    return {
      status: 'succeeded',
      transactionSignature: settleResponse.transactionSignature || null,
      attemptedAt: new Date().toISOString(),
      completedAt,
      amount,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[AgentPayment] ❌ Failed to pay facilitator: ${errorMessage}`);

    return {
      status: 'failed',
      attemptedAt: new Date().toISOString(),
      amount,
      errorMessage,
    };
  }
}

