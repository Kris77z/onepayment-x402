import { RateSource } from '../rate/types.js';

export type SupportedQuoteCurrency = 'USDC' | 'USDT';

export interface PaymentQuote {
  id: string;
  currency: SupportedQuoteCurrency;
  amount: number;
  quotedAmountUsd: number;
  rate: number;
  rateSource: RateSource;
  feedId: string;
  slot: number | null;
  fetchedAt: string;
  quoteExpiresAt: string;
  createdAt: string;
}

const quotes = new Map<string, PaymentQuote>();

function pruneExpiredQuotes(): void {
  const now = Date.now();
  for (const [quoteId, quote] of quotes.entries()) {
    if (new Date(quote.quoteExpiresAt).getTime() <= now) {
      quotes.delete(quoteId);
    }
  }
}

export function storeQuote(quote: PaymentQuote): PaymentQuote {
  pruneExpiredQuotes();
  quotes.set(quote.id, quote);
  return quote;
}

export function getQuote(quoteId: string): PaymentQuote | null {
  pruneExpiredQuotes();
  const quote = quotes.get(quoteId);
  return quote ?? null;
}

export function clearQuotes(): void {
  quotes.clear();
}


