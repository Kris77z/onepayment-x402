export type RateSource = 'switchboard' | 'manual';

export interface RateSnapshot {
  feedId: string;
  network: 'devnet' | 'mainnet' | 'testnet' | 'localnet';
  rate: number;
  rateSource: RateSource;
  slot: number | null;
  fetchedAt: string;
  expiresAt: string;
  rawValue?: string;
  decimals?: number;
}

export interface QuoteComputation {
  quoteId: string;
  currency: 'USDC' | 'USDT';
  inputAmount: number;
  quotedAmountUsd: number;
  rate: number;
  rateSource: RateSource;
  feedId: string;
  slot: number | null;
  fetchedAt: string;
  quoteExpiresAt: string;
}


