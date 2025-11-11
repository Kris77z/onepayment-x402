import { RateSource } from '../rate/types.js';

export type PaymentCurrency = 'USDC';

export type PaymentSessionStatus = 'pending' | 'settled' | 'failed';

export interface PaymentSessionQuote {
  id: string;
  currency: PaymentCurrency | 'USDT';
  rate: number;
  rateSource: RateSource;
  quotedAmountUsd: number;
  quoteExpiresAt: string;
  fetchedAt: string;
  feedId: string;
  slot: number | null;
}

export interface PaymentRequestRecord {
  raw: string;
  recordedAt: string;
}

export interface AccountSnapshot {
  gridAccountId?: string | null;
  solanaAddress?: string | null;
}

export type CommissionTransferStatus = 'pending' | 'succeeded' | 'failed';

export interface CommissionTransferAttempt {
  attemptId: string;
  status: CommissionTransferStatus;
  requestedAt: string;
  completedAt?: string;
  gridTransferId?: string;
  solanaTxSignature?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface CommissionIntentKmsPayload {
  provider: string;
  address: string;
  payload: string;
}

export interface CommissionIntentSnapshot {
  id: string;
  status: string;
  transaction: string;
  transactionSigners: string[];
  kmsPayloads: CommissionIntentKmsPayload[];
  createdAt?: string;
  validUntil?: string;
}

export interface CommissionTransferState {
  status: CommissionTransferStatus;
  amount: number;
  currency: PaymentCurrency;
  destination: AccountSnapshot;
  attempts: CommissionTransferAttempt[];
  latestError?: string;
  retryAvailable: boolean;
  intentSnapshot?: CommissionIntentSnapshot | null;
}

export interface SettlementLogEntry {
  timestamp: string;
  message: string;
  level?: 'info' | 'warn' | 'error';
  data?: Record<string, unknown>;
}

export interface PaymentSettlement {
  settledAt: string;
  transactionSignature: string | null;
  totalAmount: number;
  commissionBps: number;
  commissionAmount: number;
  netAmount: number;
  commissionRecipient: AccountSnapshot;
  merchantRecipient: AccountSnapshot;
  commissionTransfer: CommissionTransferState | null;
  rateSnapshot?: PaymentSessionQuote | null;
  explorerUrl?: string;
  settlementLog: SettlementLogEntry[];
}

export interface PaymentSessionOriginalRequest {
  amount: number;
  currency: PaymentCurrency;
  memo?: string;
  quoteId: string;
}

export interface PaymentSession {
  id: string;
  amount: number;
  currency: PaymentCurrency;
  memo?: string;
  facilitatorUrl: string;
  merchantAddress: string;
  nonce: string;
  status: PaymentSessionStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  quote: PaymentSessionQuote | null;
  rateSnapshot: PaymentSessionQuote | null;
  originalRequest: PaymentSessionOriginalRequest;
  paymentRequest?: PaymentRequestRecord;
  transactionSignature?: string;
  failureReason?: string;
  settlement?: PaymentSettlement;
  auditLog: SettlementLogEntry[];
}


