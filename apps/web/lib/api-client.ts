const API_BASE_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:4000';
const FACILITATOR_URL = process.env.NEXT_PUBLIC_FACILITATOR_URL ?? 'http://localhost:3001';

interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error?: {
    code: string;
    message: string;
  };
}

export interface QuotePayload {
  amount: number;
  currency: 'USDC';
}

export interface QuoteData {
  quoteId: string;
  currency: 'USDC';
  inputAmount: number;
  rate: number;
  rateSource: 'switchboard' | 'manual';
  quotedAmountUsd: number;
  quoteExpiresAt: string;
  fetchedAt: string;
  feedId: string;
  slot: number | null;
}

export interface CreateSessionPayload {
  amount: number;
  currency: 'USDC';
  memo?: string;
  quoteId: string;
}

export interface SessionData {
  sessionId: string;
  facilitatorUrl: string;
  merchantAddress: string;
  nonce: string;
  expiresAt: string;
  quote: QuoteData | null;
}

export type CommissionTransferStatus = 'pending' | 'succeeded' | 'failed';

export interface CommissionIntentSnapshot {
  id: string;
  status: string;
  createdAt?: string;
  validUntil?: string;
  transactionSigners: string[];
}

export interface CommissionTransferAttempt {
  attemptId: string;
  status: CommissionTransferStatus;
  requestedAt: string;
  completedAt?: string;
  gridTransferId?: string;
  solanaTxSignature?: string;
  errorMessage?: string;
}

export interface CommissionDestination {
  gridAccountId?: string | null;
  solanaAddress?: string | null;
}

export interface CommissionTransferState {
  status: CommissionTransferStatus;
  amount: number;
  currency: 'USDC';
  destination: CommissionDestination;
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
  commissionRecipient: CommissionDestination;
  merchantRecipient: CommissionDestination;
  commissionTransfer: CommissionTransferState | null;
  settlementLog: SettlementLogEntry[];
}

export interface PaymentRequestRecord {
  raw: string;
  recordedAt: string;
}

export interface PaymentStatus {
  status: 'pending' | 'settled' | 'failed';
  updatedAt: string;
  expiresAt: string;
  transactionSignature: string | null;
  failureReason: string | null;
  quote: QuoteData | null;
  paymentRequest: PaymentRequestRecord | null;
  settlement: PaymentSettlement | null;
  auditLog: SettlementLogEntry[];
}

export async function createQuote(payload: QuotePayload): Promise<QuoteData> {
  const res = await fetch(`${API_BASE_URL}/api/payments/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const json = (await res.json()) as ApiResponse<QuoteData>;
  if (!json.success || !json.data) {
    throw new Error(json.error?.message ?? 'Failed to create quote');
  }
  return json.data;
}

export async function createSession(payload: CreateSessionPayload): Promise<SessionData> {
  const res = await fetch(`${API_BASE_URL}/api/payments/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const json = (await res.json()) as ApiResponse<SessionData>;
  if (!json.success || !json.data) {
    throw new Error(json.error?.message ?? 'Failed to create payment session');
  }
  return json.data;
}

export async function settlePayment(sessionId: string, paymentRequest: unknown): Promise<string | null> {
  const res = await fetch(`${API_BASE_URL}/api/payments/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, paymentRequest })
  });

  const json = (await res.json()) as ApiResponse<{ status: string; transactionSignature: string | null }>;
  if (!json.success || !json.data) {
    throw new Error(json.error?.message ?? 'Failed to settle payment');
  }

  return json.data.transactionSignature ?? null;
}

export async function getPaymentStatus(sessionId: string): Promise<PaymentStatus> {
  const res = await fetch(`${API_BASE_URL}/api/payments/${sessionId}/status`, {
    cache: 'no-store'
  });

  const json = (await res.json()) as ApiResponse<PaymentStatus>;
  if (!json.success || !json.data) {
    throw new Error(json.error?.message ?? 'Failed to load payment status');
  }
  return json.data;
}

export async function retryCommission(sessionId: string): Promise<PaymentStatus> {
  const res = await fetch(`${API_BASE_URL}/api/payments/${sessionId}/commission/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  const json = (await res.json()) as ApiResponse<PaymentStatus>;
  if (!json.success || !json.data) {
    throw new Error(json.error?.message ?? 'Failed to retry commission intent');
  }

  return json.data;
}

export const config = {
  apiBaseUrl: API_BASE_URL,
  facilitatorUrl: FACILITATOR_URL,
  rateSource: process.env.NEXT_PUBLIC_RATE_SOURCE ?? 'switchboard'
};

