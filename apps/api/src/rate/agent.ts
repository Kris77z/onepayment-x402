import { CrossbarClient } from '@switchboard-xyz/common';
import { randomUUID } from 'crypto';
import { getRateConfig } from '../config/rateConfig.js';
import { getCachedRate, setCachedRate } from './cache.js';
import { QuoteComputation, RateSnapshot } from './types.js';
import { payFacilitatorFee } from '../services/agentPaymentService.js';

let crossbarClient: CrossbarClient | null = null;
let lastCrossbarUrl: string | null = null;

function getCrossbarClient(url: string): CrossbarClient {
  if (!crossbarClient || url !== lastCrossbarUrl) {
    crossbarClient = new CrossbarClient(url);
    lastCrossbarUrl = url;
  }

  return crossbarClient;
}

function normaliseFeedId(feedId: string): string {
  return feedId.startsWith('0x') ? feedId.slice(2) : feedId;
}

function toDecimalFromScaled(rawValue: string, scale = 18): number {
  const negative = rawValue.startsWith('-');
  const digits = negative ? rawValue.slice(1) : rawValue;
  if (digits.includes('.')) {
    const numeric = Number.parseFloat(rawValue);
    return negative ? -numeric : numeric;
  }

  const padded = digits.padStart(scale + 1, '0');
  const integerPart = padded.slice(0, -scale) || '0';
  const fractionalPart = padded.slice(-scale).replace(/0+$/, '');
  const decimalString = fractionalPart.length > 0 ? `${integerPart}.${fractionalPart}` : integerPart;
  const numeric = Number.parseFloat(decimalString);
  return negative ? -numeric : numeric;
}

async function fetchRateFromSwitchboard(feedId: string): Promise<RateSnapshot> {
  const config = getRateConfig();
  const client = getCrossbarClient(config.SWITCHBOARD_CROSSBAR_URL);

  const feedHash = normaliseFeedId(feedId);
  const response = await client.fetchOracleQuote([feedHash], config.SWITCHBOARD_NETWORK);

  const medianResponse = response.medianResponses?.[0];
  if (!medianResponse) {
    throw new Error('Switchboard response missing median price');
  }

  const rawValue = typeof medianResponse.value === 'string' ? medianResponse.value : String(medianResponse.value);
  const rate = toDecimalFromScaled(rawValue, 18);

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('Received invalid rate value from Switchboard');
  }

  const timestampSeconds = typeof response.timestamp === 'number' ? response.timestamp : undefined;

  const fetchedAt = timestampSeconds ? new Date(timestampSeconds * 1000).toISOString() : new Date().toISOString();
  const expiresAt = new Date(Date.now() + config.RATE_CACHE_TTL_MS).toISOString();

  const snapshot: RateSnapshot = {
    feedId,
    network: config.SWITCHBOARD_NETWORK,
    rate,
    rateSource: 'switchboard',
    slot: typeof response.slot === 'number' ? response.slot : null,
    fetchedAt,
    expiresAt,
    rawValue,
    decimals: 18
  };

  setCachedRate(snapshot, config.RATE_CACHE_TTL_MS);
  return snapshot;
}

async function getRateSnapshot(feedId: string): Promise<RateSnapshot> {
  const config = getRateConfig();

  const cached = getCachedRate(feedId);
  if (cached) {
    return cached;
  }

  try {
    return await fetchRateFromSwitchboard(feedId);
  } catch (error) {
    console.error('[RateAgent] switchboard fetch failed:', error);

    if (config.USD_FALLBACK_RATE !== undefined) {
      const expiresAt = new Date(Date.now() + config.RATE_CACHE_TTL_MS).toISOString();
      const snapshot: RateSnapshot = {
        feedId,
        network: config.SWITCHBOARD_NETWORK,
        rate: config.USD_FALLBACK_RATE,
        rateSource: 'manual',
        slot: null,
        fetchedAt: new Date().toISOString(),
        expiresAt
      };

      setCachedRate(snapshot, config.RATE_CACHE_TTL_MS);
      return snapshot;
    }

    throw error;
  }
}

function selectFeedId(currency: 'USDC' | 'USDT'): string {
  const config = getRateConfig();
  if (currency === 'USDT') {
    return config.SWITCHBOARD_FEED_ID_USDT ?? config.SWITCHBOARD_FEED_ID;
  }
  return config.SWITCHBOARD_FEED_ID;
}

function normaliseTokenAmount(amount: number, currency: 'USDC' | 'USDT'): number {
  const decimals = currency === 'USDC' || currency === 'USDT' ? 6 : 6;
  return amount / Math.pow(10, decimals);
}

/**
 * 触发 RateAgent 的 x402 微支付（异步执行，不阻塞报价返回）
 */
async function triggerAgentPayment(): Promise<void> {
  const agentPaymentAmount = process.env.RATE_AGENT_PAYMENT_AMOUNT
    ? Number.parseInt(process.env.RATE_AGENT_PAYMENT_AMOUNT, 10)
    : 1000; // 默认 0.001 USDC (1000 原子单位)

  // 异步执行支付，不阻塞报价返回
  payFacilitatorFee(agentPaymentAmount).catch((error) => {
    console.error('[RateAgent] Agent payment failed (non-blocking):', error);
  });
}

export async function generateQuote(amount: number, currency: 'USDC' | 'USDT' = 'USDC'): Promise<QuoteComputation> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be a positive number');
  }

  const feedId = selectFeedId(currency);
  const snapshot = await getRateSnapshot(feedId);

  const baseUnits = normaliseTokenAmount(amount, currency);
  const quotedAmountUsd = Number((baseUnits * snapshot.rate).toFixed(6));

  // 触发 Agent 支付（仅在非缓存命中时，避免重复支付）
  // 注意：这里只在从 Switchboard 获取新汇率时支付，使用缓存时不支付
  // 如果需要每次查询都支付，可以移除缓存检查
  if (snapshot.rateSource === 'switchboard') {
    triggerAgentPayment();
  }

  return {
    quoteId: `pquote_${randomUUID()}`,
    currency,
    inputAmount: amount,
    quotedAmountUsd,
    rate: snapshot.rate,
    rateSource: snapshot.rateSource,
    feedId: snapshot.feedId,
    slot: snapshot.slot,
    fetchedAt: snapshot.fetchedAt,
    quoteExpiresAt: snapshot.expiresAt
  };
}

export async function latestRateSnapshot(currency: 'USDC' | 'USDT' = 'USDC'): Promise<RateSnapshot> {
  const feedId = selectFeedId(currency);
  return getRateSnapshot(feedId);
}


