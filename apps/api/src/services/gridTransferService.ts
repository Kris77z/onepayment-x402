import bs58 from 'bs58';
import { Keypair, VersionedTransaction, Transaction } from '@solana/web3.js';
import type { TransactionPayload } from '@sqds/grid';
import { getConfig } from '../config.js';
import { getGridClient } from './gridSdkClient.js';
import type {
  CommissionIntentSnapshot,
  CommissionTransferStatus,
  CommissionIntentKmsPayload
} from '../stores/paymentSessionTypes.js';

export interface CommissionPaymentIntentRequest {
  amount: string;
  gridUserId: string;
  sourceAccount: string;
  destinationAddress: string;
  memo?: string;
}

export interface CommissionPaymentIntentResult {
  success: boolean;
  intentSnapshot?: CommissionIntentSnapshot;
  rawPayload?: unknown;
  error?: string;
}

export interface ExecuteCommissionIntentParams {
  sourceAccount: string;
  intentSnapshot: CommissionIntentSnapshot;
}

export interface ExecuteCommissionIntentResult {
  status: CommissionTransferStatus;
  signature?: string;
  error?: string;
}

function isKmsPayload(value: unknown): value is CommissionIntentKmsPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { provider?: unknown }).provider === 'string' &&
    typeof (value as { address?: unknown }).address === 'string' &&
    typeof (value as { payload?: unknown }).payload === 'string'
  );
}

function toCommissionIntentSnapshot(input: any): CommissionIntentSnapshot | null {
  const transactionPayload = input?.transactionPayload as TransactionPayload | undefined;
  const transaction = (transactionPayload?.transaction ?? input?.transaction) as string | undefined;
  if (!transaction || typeof transaction !== 'string') {
    return null;
  }

  const combinedSigners = new Set<string>();
  if (Array.isArray(transactionPayload?.transaction_signers)) {
    for (const signer of transactionPayload.transaction_signers) {
      if (typeof signer === 'string' && signer.length > 0) {
        combinedSigners.add(signer);
      }
    }
  }
  if (Array.isArray(input?.transaction_signers)) {
    for (const signer of input.transaction_signers) {
      if (typeof signer === 'string' && signer.length > 0) {
        combinedSigners.add(signer);
      }
    }
  }

  return {
    id: typeof input?.id === 'string' ? input.id : '',
    status: typeof input?.status === 'string' ? input.status : 'pending',
    transaction,
    transactionSigners: Array.from(combinedSigners),
    kmsPayloads: Array.isArray(transactionPayload?.kms_payloads)
      ? transactionPayload.kms_payloads.filter((value): value is CommissionIntentKmsPayload => isKmsPayload(value))
      : [],
    createdAt: typeof input?.created_at === 'string' ? input.created_at : undefined,
    validUntil: typeof input?.valid_until === 'string' ? input.valid_until : undefined
  };
}

export async function createCommissionPaymentIntent(
  request: CommissionPaymentIntentRequest
): Promise<CommissionPaymentIntentResult> {
  const config = getConfig();

  if (!config.GRID_API_KEY) {
    return { success: false, error: 'GRID_API_KEY is not configured; cannot create payment intent' };
  }

  if (!request.gridUserId) {
    return { success: false, error: 'GRID_USER_ID is required to create payment intent' };
  }

  const gridClient = getGridClient();

  try {
    const apiResponse = await gridClient.createPaymentIntent(
      request.sourceAccount,
      {
        amount: request.amount,
        grid_user_id: request.gridUserId,
        source: {
          account: request.sourceAccount,
          currency: 'usdc'
        },
        destination: {
          address: request.destinationAddress,
          currency: 'usdc'
        }
      }
    );

    if ('error' in apiResponse && apiResponse.error) {
      return { success: false, error: apiResponse.error };
    }

    const payload = (apiResponse as any)?.data ?? apiResponse;
    const snapshot = toCommissionIntentSnapshot(payload);

    if (!snapshot) {
      return { success: false, error: 'Payment intent created but transaction payload missing' };
    }

    return { success: true, intentSnapshot: snapshot, rawPayload: payload };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error creating payment intent'
    };
  }
}

export async function executeCommissionPaymentIntent(
  params: ExecuteCommissionIntentParams
): Promise<ExecuteCommissionIntentResult> {
  const config = getConfig();

  if (!config.GRID_SIGNER_PRIVATE_KEY) {
    return {
      status: 'failed',
      error: 'GRID_SIGNER_PRIVATE_KEY is not configured; cannot sign payment intent'
    };
  }

  try {
    const signerSecret = bs58.decode(config.GRID_SIGNER_PRIVATE_KEY);
    const signerKeypair = Keypair.fromSecretKey(signerSecret);
    const signerPublicKey = config.GRID_SIGNER_ADDRESS ?? signerKeypair.publicKey.toBase58();

    const gridClient = getGridClient();

    const rawTx = Buffer.from(params.intentSnapshot.transaction, 'base64');
    let signedTransactionBase64: string | null = null;

    try {
      const versioned = VersionedTransaction.deserialize(rawTx);
      versioned.sign([signerKeypair]);
      signedTransactionBase64 = Buffer.from(versioned.serialize()).toString('base64');
    } catch {
      try {
        const legacy = Transaction.from(rawTx);
        legacy.partialSign(signerKeypair);
        signedTransactionBase64 = legacy
          .serialize({ requireAllSignatures: false, verifySignatures: false })
          .toString('base64');
      } catch {
        signedTransactionBase64 = null;
      }
    }

    if (!signedTransactionBase64) {
      const sessionSecrets = [
        {
          publicKey: signerPublicKey,
          privateKey: bs58.encode(signerKeypair.secretKey),
          provider: 'solana',
          tag: 'solana'
        }
      ];

      const signResult = await gridClient.sign({
        sessionSecrets: sessionSecrets as any,
        transactionPayload: {
          transaction: params.intentSnapshot.transaction,
          transaction_signers:
            params.intentSnapshot.transactionSigners.length > 0
              ? params.intentSnapshot.transactionSigners
              : [signerPublicKey],
          kms_payloads: params.intentSnapshot.kmsPayloads ?? []
        }
      });

      signedTransactionBase64 = signResult.transaction;
    }

    if (!signedTransactionBase64) {
      return {
        status: 'failed',
        error: 'Unable to sign commission payment intent'
      };
    }

    const sendResult = await gridClient.send({
      signedTransactionPayload: {
        transaction: signedTransactionBase64,
        kms_payloads: []
      },
      address: params.sourceAccount
    });

    const signature =
      (sendResult as any)?.transactionSignature ??
      (sendResult as any)?.signature ??
      (sendResult as any)?.tx_hash ??
      null;

    return {
      status: 'succeeded',
      signature: signature ?? undefined
    };
  } catch (error) {
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error executing payment intent'
    };
  }
}
