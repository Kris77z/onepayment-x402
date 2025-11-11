import { randomBytes, randomUUID } from 'crypto';
import { PaymentQuote } from './paymentQuoteStore.js';
import {
  PaymentSession,
  PaymentSessionQuote,
  PaymentSettlement,
  PaymentSessionStatus,
  SettlementLogEntry
} from './paymentSessionTypes.js';
import { loadSessionsFromDisk, saveSessionsToDisk } from './paymentSessionPersistence.js';

interface CreateSessionInput {
  amount: number;
  currency: 'USDC';
  memo?: string;
  quoteId: string;
}

interface SessionContext {
  facilitatorUrl: string;
  merchantAddress: string;
  ttlMs: number;
  quote?: PaymentQuote | null;
}

const sessions = new Map<string, PaymentSession>();

function initializeStore(): void {
  const storedSessions = loadSessionsFromDisk();
  for (const session of storedSessions) {
    sessions.set(session.id, session);
  }
}

initializeStore();

function persistSessions(): void {
  saveSessionsToDisk(Array.from(sessions.values()));
}

function addAuditLog(session: PaymentSession, entry: SettlementLogEntry): void {
  session.auditLog.push(entry);
}

function pruneExpiredSessions(): void {
  const now = Date.now();
  let mutated = false;
  for (const [sessionId, session] of sessions.entries()) {
    if (new Date(session.expiresAt).getTime() <= now && session.status === 'pending') {
      sessions.delete(sessionId);
      mutated = true;
    }
  }

  if (mutated) {
    persistSessions();
  }
}

export function createPaymentSession(payload: CreateSessionInput, context: SessionContext): PaymentSession {
  pruneExpiredSessions();

  const now = new Date();
  const expiresAt = new Date(now.getTime() + context.ttlMs);
  const quoteSummary: PaymentSessionQuote | null = context.quote
    ? {
        id: context.quote.id,
        currency: context.quote.currency,
        rate: context.quote.rate,
        rateSource: context.quote.rateSource,
        quotedAmountUsd: context.quote.quotedAmountUsd,
        quoteExpiresAt: context.quote.quoteExpiresAt,
        fetchedAt: context.quote.fetchedAt,
        feedId: context.quote.feedId,
        slot: context.quote.slot
      }
    : null;

  const session: PaymentSession = {
    id: `psess_${randomUUID()}`,
    amount: payload.amount,
    currency: payload.currency,
    memo: payload.memo,
    facilitatorUrl: context.facilitatorUrl,
    merchantAddress: context.merchantAddress,
    nonce: randomBytes(16).toString('hex'),
    status: 'pending',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    quote: quoteSummary,
    rateSnapshot: quoteSummary,
    originalRequest: {
      amount: payload.amount,
      currency: payload.currency,
      memo: payload.memo,
      quoteId: payload.quoteId
    },
    auditLog: [
      {
        timestamp: now.toISOString(),
        message: 'Payment session created',
        level: 'info'
      }
    ]
  };

  sessions.set(session.id, session);
  persistSessions();
  return session;
}

export function getPaymentSession(sessionId: string): PaymentSession | null {
  pruneExpiredSessions();
  const session = sessions.get(sessionId);
  return session ?? null;
}

export function recordPaymentRequest(sessionId: string, paymentRequest: string): PaymentSession | null {
  const session = getPaymentSession(sessionId);
  if (!session) {
    return null;
  }

  const now = new Date().toISOString();
  session.paymentRequest = {
    raw: paymentRequest,
    recordedAt: now
  };
  session.failureReason = undefined;
  session.updatedAt = now;
  addAuditLog(session, {
    timestamp: now,
    message: 'Payment request recorded',
    level: 'info'
  });

  persistSessions();
  return session;
}

export function markSessionSettled(
  sessionId: string,
  settlement: PaymentSettlement,
  status: PaymentSessionStatus = 'settled'
): PaymentSession | null {
  const session = getPaymentSession(sessionId);
  if (!session) {
    return null;
  }

  session.status = status;
  session.transactionSignature = settlement.transactionSignature ?? undefined;
  session.failureReason = undefined;
  session.settlement = settlement;
  session.rateSnapshot = settlement.rateSnapshot ?? session.rateSnapshot;
  session.updatedAt = settlement.settledAt;

  addAuditLog(session, {
    timestamp: settlement.settledAt,
    message: 'Payment session settled',
    level: 'info',
    data: {
      transactionSignature: settlement.transactionSignature,
      commissionAmount: settlement.commissionAmount,
      netAmount: settlement.netAmount,
      commissionStatus: settlement.commissionTransfer?.status ?? 'n/a'
    }
  });

  persistSessions();
  return session;
}

export function markSessionFailed(sessionId: string, reason?: string): PaymentSession | null {
  const session = getPaymentSession(sessionId);
  if (!session) {
    return null;
  }

  const now = new Date().toISOString();
  session.status = 'failed';
  session.failureReason = reason;
  session.updatedAt = now;
  addAuditLog(session, {
    timestamp: now,
    message: 'Payment session marked as failed',
    level: 'error',
    data: reason ? { reason } : undefined
  });

  persistSessions();
  return session;
}

export function updatePaymentSession(
  sessionId: string,
  updater: (session: PaymentSession) => void
): PaymentSession | null {
  const session = getPaymentSession(sessionId);
  if (!session) {
    return null;
  }

  updater(session);
  session.updatedAt = new Date().toISOString();
  persistSessions();
  return session;
}

