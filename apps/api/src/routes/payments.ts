import { randomUUID } from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { getConfig } from '../config.js';
import {
  createPaymentSession,
  getPaymentSession,
  recordPaymentRequest,
  markSessionFailed,
  markSessionSettled,
  updatePaymentSession
} from '../stores/paymentSessionStore.js';
import { processPaymentThroughFacilitator } from '../services/facilitatorService.js';
import { generateQuote } from '../rate/agent.js';
import { getQuote, storeQuote, PaymentQuote } from '../stores/paymentQuoteStore.js';
import { calculateCommission, getCommissionBps } from '../services/commissionService.js';
import { createCommissionPaymentIntent, executeCommissionPaymentIntent } from '../services/gridTransferService.js';
import type {
  PaymentSession,
  PaymentSessionQuote,
  PaymentSettlement,
  CommissionTransferState,
  CommissionTransferAttempt,
  SettlementLogEntry
} from '../stores/paymentSessionTypes.js';

const SESSION_TTL_MS = 5 * 60 * 1000;

const router = Router();

const createQuoteSchema = z.object({
  amount: z.number().positive(),
  currency: z.enum(['USDC'])
});

const createSessionSchema = z.object({
  amount: z.number().positive(),
  currency: z.enum(['USDC']),
  memo: z.string().max(120).optional(),
  quoteId: z.string().min(1)
});

const paymentRequestSchema = z.union([z.string().min(1), z.record(z.any())]);

const settleSchema = z.object({
  sessionId: z.string().min(1),
  paymentRequest: paymentRequestSchema
});

router.post('/quote', async (req, res) => {
  const parse = createQuoteSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: 'PAYMENT_INVALID_PAYLOAD',
        message: 'Invalid quote payload',
        details: parse.error.flatten()
      }
    });
    return;
  }

  try {
    const quoteCalculation = await generateQuote(parse.data.amount, parse.data.currency);
    const storedQuote = storeQuote({
      id: quoteCalculation.quoteId,
      currency: parse.data.currency,
      amount: quoteCalculation.inputAmount,
      quotedAmountUsd: quoteCalculation.quotedAmountUsd,
      rate: quoteCalculation.rate,
      rateSource: quoteCalculation.rateSource,
      feedId: quoteCalculation.feedId,
      slot: quoteCalculation.slot,
      fetchedAt: quoteCalculation.fetchedAt,
      quoteExpiresAt: quoteCalculation.quoteExpiresAt,
      createdAt: new Date().toISOString()
    });

    res.json({
      success: true,
      data: serializeQuote(storedQuote)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch rates from Switchboard';
    res.status(503).json({
      success: false,
      data: null,
      error: {
        code: 'RATE_SOURCE_UNAVAILABLE',
        message
      }
    });
  }
});

router.post('/session', (req, res) => {
  const parse = createSessionSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: 'PAYMENT_INVALID_PAYLOAD',
        message: 'Invalid payment session payload',
        details: parse.error.flatten()
      }
    });
    return;
  }

  const config = getConfig();
  if (!config.MERCHANT_SOLANA_ADDRESS) {
    res.status(503).json({
      success: false,
      data: null,
      error: {
        code: 'PAYMENT_MERCHANT_UNAVAILABLE',
        message: 'Merchant Solana address not configured'
      }
    });
    return;
  }

  const quote = getQuote(parse.data.quoteId);
  if (!quote) {
    res.status(404).json({
      success: false,
      data: null,
      error: {
        code: 'PAYMENT_QUOTE_NOT_FOUND',
        message: `Quote ${parse.data.quoteId} not found`
      }
    });
    return;
  }

  if (quote.currency !== parse.data.currency) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: 'PAYMENT_QUOTE_CURRENCY_MISMATCH',
        message: 'Quote currency does not match requested currency'
      }
    });
    return;
  }

  if (new Date(quote.quoteExpiresAt).getTime() <= Date.now()) {
    res.status(409).json({
      success: false,
      data: null,
      error: {
        code: 'PAYMENT_QUOTE_EXPIRED',
        message: `Quote ${parse.data.quoteId} has expired`
      }
    });
    return;
  }

  const session = createPaymentSession(parse.data, {
    facilitatorUrl: config.FACILITATOR_URL,
    merchantAddress: config.MERCHANT_SOLANA_ADDRESS,
    ttlMs: SESSION_TTL_MS,
    quote
  });

  res.json({
    success: true,
    data: {
      sessionId: session.id,
      facilitatorUrl: session.facilitatorUrl,
      merchantAddress: session.merchantAddress,
      nonce: session.nonce,
      expiresAt: session.expiresAt,
      quote: session.quote ? serializeSessionQuote(session.quote) : null
    }
  });
});

router.post('/settle', async (req, res) => {
  const parse = settleSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: 'PAYMENT_INVALID_PAYLOAD',
        message: 'Invalid settlement payload',
        details: parse.error.flatten()
      }
    });
    return;
  }

  const paymentRequestInput = parse.data.paymentRequest;
  const paymentRequestString = typeof paymentRequestInput === 'string' ? paymentRequestInput : JSON.stringify(paymentRequestInput);

  const config = getConfig();
  const session = recordPaymentRequest(parse.data.sessionId, paymentRequestString);
  if (!session) {
    res.status(404).json({
      success: false,
      data: null,
      error: {
        code: 'PAYMENT_SESSION_NOT_FOUND',
        message: `Session ${parse.data.sessionId} not found`
      }
    });
    return;
  }

  const facilitatorResult = await processPaymentThroughFacilitator(paymentRequestString);

  if (!facilitatorResult.success) {
    const failureStage = facilitatorResult.failureStage ?? 'settle';
    const message = facilitatorResult.error ?? 'Facilitator processing failed';

    markSessionFailed(parse.data.sessionId, message);

    const statusCode = failureStage === 'verify' ? 400 : failureStage === 'network' ? 504 : 502;

    res.status(statusCode).json({
      success: false,
      data: null,
      error: {
        code:
          failureStage === 'verify'
            ? 'FACILITATOR_VERIFY_FAILED'
            : failureStage === 'network'
            ? 'FACILITATOR_UNAVAILABLE'
            : 'FACILITATOR_SETTLE_FAILED',
        message
      }
    });
    return;
  }

  const commissionBps = getCommissionBps();
  let commissionAmounts;
  try {
    commissionAmounts = calculateCommission(session.amount, commissionBps);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Commission calculation failed';
    markSessionFailed(parse.data.sessionId, message);
    res.status(500).json({
      success: false,
      data: null,
      error: {
        code: 'COMMISSION_CALCULATION_FAILED',
        message
      }
    });
    return;
  }

  const settlementTimestamp = new Date().toISOString();
  const settlementLog: SettlementLogEntry[] = [
    {
      timestamp: settlementTimestamp,
      message: 'Facilitator settlement confirmed',
      level: 'info',
      data: {
        transactionSignature: facilitatorResult.transactionSignature ?? null
      }
    }
  ];

  let commissionTransferState: CommissionTransferState | null = null;
  let paymentIntentError: string | null = null;

  if (commissionAmounts.commissionAmount > 0) {
    const transferAttemptId = `cta_${randomUUID()}`;
    const transferRequestedAt = new Date().toISOString();

    if (config.MERCHANT_GRID_ACCOUNT_ID && config.COMMISSION_GRID_ACCOUNT_ID) {
      const intentResult = await createCommissionPaymentIntent({
        amount: commissionAmounts.commissionAmount.toString(),
        gridUserId: config.GRID_USER_ID ?? '',
        sourceAccount: config.MERCHANT_GRID_ACCOUNT_ID,
        destinationAddress: config.COMMISSION_SOLANA_ADDRESS ?? config.COMMISSION_GRID_ACCOUNT_ID,
        memo: `Commission payout for session ${session.id}`
      });

      if (intentResult.success && intentResult.intentSnapshot) {
        commissionTransferState = {
          status: 'pending',
          amount: commissionAmounts.commissionAmount,
          currency: session.currency,
          destination: {
            gridAccountId: config.COMMISSION_GRID_ACCOUNT_ID,
            solanaAddress: config.COMMISSION_SOLANA_ADDRESS ?? null
          },
          attempts: [
            {
              attemptId: transferAttemptId,
              status: 'pending',
              requestedAt: transferRequestedAt,
              completedAt: undefined,
              gridTransferId: intentResult.intentSnapshot.id,
              errorMessage: undefined,
              metadata: {
                paymentIntentId: intentResult.intentSnapshot.id,
                transactionSigners: intentResult.intentSnapshot.transactionSigners,
                status: intentResult.intentSnapshot.status
              }
            }
          ],
          latestError: undefined,
          retryAvailable: true,
          intentSnapshot: intentResult.intentSnapshot
        };

        settlementLog.push({
          timestamp: transferRequestedAt,
          message: 'Commission payment intent created',
          level: 'info',
          data: {
            intentId: intentResult.intentSnapshot.id,
            status: intentResult.intentSnapshot.status,
            transactionSigners: intentResult.intentSnapshot.transactionSigners
          }
        });

        const executionResult = await executeCommissionPaymentIntent({
          sourceAccount: config.MERCHANT_GRID_ACCOUNT_ID,
          intentSnapshot: intentResult.intentSnapshot
        });

        const latestAttempt =
          commissionTransferState.attempts[commissionTransferState.attempts.length - 1];

        if (executionResult.status === 'succeeded') {
          const completedAt = new Date().toISOString();
          commissionTransferState.status = 'succeeded';
          commissionTransferState.retryAvailable = false;
          commissionTransferState.latestError = undefined;
          latestAttempt.status = 'succeeded';
          latestAttempt.completedAt = completedAt;
          latestAttempt.solanaTxSignature = executionResult.signature ?? undefined;

          settlementLog.push({
            timestamp: completedAt,
            message: 'Commission payment intent executed successfully',
            level: 'info',
            data: {
              intentId: intentResult.intentSnapshot.id,
              signature: executionResult.signature ?? null
            }
          });
        } else {
          commissionTransferState.status = 'failed';
          commissionTransferState.retryAvailable = true;
          commissionTransferState.latestError = executionResult.error ?? 'Unknown execution error';
          latestAttempt.status = 'failed';
          latestAttempt.errorMessage = executionResult.error ?? undefined;

          settlementLog.push({
            timestamp: new Date().toISOString(),
            message: 'Commission payment intent execution failed',
            level: 'warn',
            data: {
              intentId: intentResult.intentSnapshot.id,
              error: executionResult.error ?? 'Unknown execution error'
            }
          });
        }
      } else {
        paymentIntentError = intentResult.error ?? 'Unknown payment intent error';
        commissionTransferState = {
          status: 'failed',
          amount: commissionAmounts.commissionAmount,
          currency: session.currency,
          destination: {
            gridAccountId: config.COMMISSION_GRID_ACCOUNT_ID ?? null,
            solanaAddress: config.COMMISSION_SOLANA_ADDRESS ?? null
          },
          attempts: [
            {
              attemptId: transferAttemptId,
              status: 'failed',
              requestedAt: transferRequestedAt,
              errorMessage: paymentIntentError ?? undefined
            }
          ],
          latestError: paymentIntentError ?? undefined,
          retryAvailable: true,
          intentSnapshot: null
        };
      }
    } else {
      const missingFields = [
        !config.MERCHANT_GRID_ACCOUNT_ID ? 'MERCHANT_GRID_ACCOUNT_ID' : null,
        !config.COMMISSION_GRID_ACCOUNT_ID ? 'COMMISSION_GRID_ACCOUNT_ID' : null
      ].filter(Boolean);
      const message = `Commission transfer skipped: missing ${missingFields.join(', ')}`;

      const attempt: CommissionTransferAttempt = {
        attemptId: transferAttemptId,
        status: 'failed',
        requestedAt: transferRequestedAt,
        errorMessage: message,
        metadata: { missingFields }
      };

      commissionTransferState = {
        status: 'failed',
        amount: commissionAmounts.commissionAmount,
        currency: session.currency,
        destination: {
          gridAccountId: config.COMMISSION_GRID_ACCOUNT_ID ?? null,
          solanaAddress: config.COMMISSION_SOLANA_ADDRESS ?? null
        },
        attempts: [attempt],
        latestError: message,
        retryAvailable: true
      };

      settlementLog.push({
        timestamp: transferRequestedAt,
        message:
          paymentIntentError ??
          `Commission payment intent skipped due to missing configuration (${missingFields.join(', ')})`,
        level: 'warn',
        data: paymentIntentError
          ? { error: paymentIntentError }
          : {
              missingFields
            }
      });
    }
  } else {
    settlementLog.push({
      timestamp: settlementTimestamp,
      message: 'Commission transfer not required (zero commission amount)',
      level: 'info'
    });
  }

  const settlement: PaymentSettlement = {
    settledAt: settlementTimestamp,
    transactionSignature: facilitatorResult.transactionSignature ?? null,
    totalAmount: commissionAmounts.totalAmount,
    commissionBps,
    commissionAmount: commissionAmounts.commissionAmount,
    netAmount: commissionAmounts.netAmount,
    commissionRecipient: {
      gridAccountId: config.COMMISSION_GRID_ACCOUNT_ID ?? null,
      solanaAddress: config.COMMISSION_SOLANA_ADDRESS ?? null
    },
    merchantRecipient: {
      gridAccountId: config.MERCHANT_GRID_ACCOUNT_ID ?? null,
      solanaAddress: session.merchantAddress
    },
    commissionTransfer: commissionTransferState,
    rateSnapshot: session.rateSnapshot ?? session.quote ?? null,
    explorerUrl: buildExplorerUrl(facilitatorResult.transactionSignature ?? null),
    settlementLog
  };

  const settledSession = markSessionSettled(parse.data.sessionId, settlement);

  res.status(200).json({
    success: true,
    data: {
      status: settledSession?.status ?? 'settled',
      transactionSignature: settlement.transactionSignature,
      commission: {
        amount: settlement.commissionAmount,
        bps: settlement.commissionBps,
        status: commissionTransferState?.status ?? 'not_required',
        transferId:
          commissionTransferState && commissionTransferState.attempts.length > 0
            ? commissionTransferState.attempts[commissionTransferState.attempts.length - 1].gridTransferId ?? null
            : null,
        retryAvailable: commissionTransferState?.retryAvailable ?? false,
        lastError: commissionTransferState?.latestError ?? null
      },
      netAmount: settlement.netAmount,
      settlementTimestamp,
      explorerUrl: settlement.explorerUrl ?? null
    }
  });
});

router.get('/:sessionId/status', (req, res) => {
  const session = getPaymentSession(req.params.sessionId);

  if (!session) {
    res.status(404).json({
      success: false,
      data: null,
      error: {
        code: 'PAYMENT_SESSION_NOT_FOUND',
        message: `Session ${req.params.sessionId} not found`
      }
    });
    return;
  }

  res.json({
    success: true,
    data: serializeSessionStatus(session)
  });
});

router.post('/:sessionId/commission/retry', async (req, res) => {
  const sessionId = req.params.sessionId;
  const session = getPaymentSession(sessionId);

  if (!session) {
    res.status(404).json({
      success: false,
      data: null,
      error: {
        code: 'PAYMENT_SESSION_NOT_FOUND',
        message: `Session ${sessionId} not found`
      }
    });
    return;
  }

  const config = getConfig();
  if (!config.MERCHANT_GRID_ACCOUNT_ID) {
    res.status(503).json({
      success: false,
      data: null,
      error: {
        code: 'PAYMENT_MERCHANT_UNAVAILABLE',
        message: 'Merchant Grid account ID not configured'
      }
    });
    return;
  }

  const settlement = session.settlement;
  const commissionTransfer = settlement?.commissionTransfer;

  if (!settlement || !commissionTransfer) {
    res.status(409).json({
      success: false,
      data: null,
      error: {
        code: 'COMMISSION_NOT_AVAILABLE',
        message: 'Commission transfer state not found for this session'
      }
    });
    return;
  }

  if (!commissionTransfer.intentSnapshot) {
    res.status(409).json({
      success: false,
      data: null,
      error: {
        code: 'COMMISSION_INTENT_MISSING',
        message: 'Commission payment intent snapshot not recorded'
      }
    });
    return;
  }

  const attemptId = `cta_${randomUUID()}`;
  const requestedAt = new Date().toISOString();

  try {
    updatePaymentSession(sessionId, (current) => {
      const targetTransfer = current.settlement?.commissionTransfer;
      if (!targetTransfer) {
        throw new Error('commissionTransferMissing');
      }

      targetTransfer.attempts.push({
        attemptId,
        status: 'pending',
        requestedAt,
        gridTransferId: targetTransfer.intentSnapshot?.id,
        metadata: {
          paymentIntentId: targetTransfer.intentSnapshot?.id
        }
      });

      targetTransfer.status = 'pending';
      targetTransfer.latestError = undefined;
      targetTransfer.retryAvailable = true;

      current.settlement?.settlementLog.push({
        timestamp: requestedAt,
        message: 'Commission payment intent retry requested',
        level: 'info',
        data: {
          attemptId,
          intentId: targetTransfer.intentSnapshot?.id ?? null
        }
      });
    });
  } catch (error) {
    res.status(409).json({
      success: false,
      data: null,
      error: {
        code: 'COMMISSION_STATE_LOCKED',
        message: error instanceof Error ? error.message : 'Unable to enqueue retry'
      }
    });
    return;
  }

  const executeResult = await executeCommissionPaymentIntent({
    sourceAccount: config.MERCHANT_GRID_ACCOUNT_ID,
    intentSnapshot: commissionTransfer.intentSnapshot
  });

  const updatedSession = updatePaymentSession(sessionId, (current) => {
    const targetTransfer = current.settlement?.commissionTransfer;
    if (!targetTransfer) {
      return;
    }

    const targetAttempt = targetTransfer.attempts.find((attempt) => attempt.attemptId === attemptId);
    if (!targetAttempt) {
      return;
    }

    const completedAt = new Date().toISOString();

    if (executeResult.status === 'succeeded') {
      targetTransfer.status = 'succeeded';
      targetTransfer.retryAvailable = false;
      targetTransfer.latestError = undefined;
      targetAttempt.status = 'succeeded';
      targetAttempt.completedAt = completedAt;
      targetAttempt.solanaTxSignature = executeResult.signature ?? undefined;
      current.settlement?.settlementLog.push({
        timestamp: completedAt,
        message: 'Commission payment intent executed successfully',
        level: 'info',
        data: {
          attemptId,
          signature: executeResult.signature ?? null
        }
      });
    } else {
      targetTransfer.status = 'failed';
      targetTransfer.retryAvailable = true;
      targetTransfer.latestError = executeResult.error ?? 'Unknown execution error';
      targetAttempt.status = 'failed';
      targetAttempt.completedAt = completedAt;
      targetAttempt.errorMessage = executeResult.error ?? undefined;
      current.settlement?.settlementLog.push({
        timestamp: completedAt,
        message: 'Commission payment intent execution failed',
        level: 'warn',
        data: {
          attemptId,
          error: executeResult.error ?? 'Unknown execution error'
        }
      });
    }
  });

  res.json({
    success: true,
    data: serializeSessionStatus(updatedSession ?? session)
  });
});

export default router;

function serializeSessionStatus(session: PaymentSession) {
  return {
    status: session.status,
    updatedAt: session.updatedAt,
    expiresAt: session.expiresAt,
    transactionSignature: session.transactionSignature ?? null,
    failureReason: session.failureReason ?? null,
    quote: session.quote ? serializeSessionQuote(session.quote) : null,
    paymentRequest: session.paymentRequest ?? null,
    settlement: session.settlement ?? null,
    auditLog: session.auditLog
  };
}

function serializeQuote(quote: PaymentQuote) {
  return {
    quoteId: quote.id,
    currency: quote.currency,
    inputAmount: quote.amount,
    rate: quote.rate,
    rateSource: quote.rateSource,
    quotedAmountUsd: quote.quotedAmountUsd,
    quoteExpiresAt: quote.quoteExpiresAt,
    fetchedAt: quote.fetchedAt,
    feedId: quote.feedId,
    slot: quote.slot
  };
}

function serializeSessionQuote(quote: PaymentQuote | PaymentSessionQuote) {
  return {
    quoteId: quote.id,
    currency: quote.currency,
    rate: quote.rate,
    rateSource: quote.rateSource,
    quotedAmountUsd: quote.quotedAmountUsd,
    quoteExpiresAt: quote.quoteExpiresAt,
    fetchedAt: quote.fetchedAt,
    feedId: quote.feedId,
    slot: quote.slot
  };
}

function buildExplorerUrl(signature: string | null): string | undefined {
  if (!signature) {
    return undefined;
  }

  const rpcUrl = process.env.SOLANA_RPC_URL ?? '';
  let cluster: string | undefined;
  if (rpcUrl.includes('devnet')) {
    cluster = 'devnet';
  } else if (rpcUrl.includes('testnet')) {
    cluster = 'testnet';
  } else if (rpcUrl.includes('mainnet')) {
    cluster = 'mainnet';
  }

  const base = `https://solscan.io/tx/${signature}`;
  return cluster ? `${base}?cluster=${cluster}` : base;
}

