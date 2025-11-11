import { getConfig } from '../config.js';

interface FacilitatorResponse<T> {
  success: boolean;
  data: T | null;
  error?: unknown;
}

interface VerifyResponse {
  isValid: boolean;
  error?: string;
}

interface SettleResponse {
  status: string;
  transactionSignature?: string;
  error?: string;
}

export interface ProcessPaymentResult {
  success: boolean;
  transactionSignature?: string | null;
  failureStage?: 'verify' | 'settle' | 'network';
  error?: string;
}

export async function checkFacilitatorHealth(): Promise<FacilitatorResponse<unknown>> {
  const { FACILITATOR_URL, REQUEST_TIMEOUT_MS } = getConfig();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(new URL('/health', FACILITATOR_URL), {
      signal: controller.signal
    });

    clearTimeout(timeout);
    const json = await res.json();
    return { success: res.ok, data: json, error: res.ok ? undefined : json };
  } catch (error) {
    clearTimeout(timeout);
    return { success: false, data: null, error };
  }
}

export async function verifyPaymentRequest(paymentRequest: string): Promise<VerifyResponse> {
  const { FACILITATOR_URL, REQUEST_TIMEOUT_MS } = getConfig();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(new URL('/verify', FACILITATOR_URL), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ paymentRequest }),
      signal: controller.signal
    });

    const json = (await res.json()) as VerifyResponse;
    clearTimeout(timeout);
    return json;
  } catch (error) {
    clearTimeout(timeout);
    return { isValid: false, error: error instanceof Error ? error.message : 'Unknown facilitator error' };
  }
}

export async function settlePaymentRequest(paymentRequest: string): Promise<SettleResponse> {
  const { FACILITATOR_URL, REQUEST_TIMEOUT_MS } = getConfig();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(new URL('/settle', FACILITATOR_URL), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ paymentRequest }),
      signal: controller.signal
    });

    const json = (await res.json()) as SettleResponse;
    clearTimeout(timeout);
    return json;
  } catch (error) {
    clearTimeout(timeout);
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown facilitator error'
    };
  }
}

export async function processPaymentThroughFacilitator(paymentRequest: string): Promise<ProcessPaymentResult> {
  const verifyResponse = await verifyPaymentRequest(paymentRequest);

  if (!verifyResponse.isValid) {
    return {
      success: false,
      failureStage: 'verify',
      error: verifyResponse.error ?? 'Facilitator verification failed'
    };
  }

  const settleResponse = await settlePaymentRequest(paymentRequest);

  if (settleResponse.status !== 'settled') {
    return {
      success: false,
      failureStage: 'settle',
      error: settleResponse.error ?? 'Facilitator returned non-settled status'
    };
  }

  return {
    success: true,
    transactionSignature: settleResponse.transactionSignature ?? null
  };
}

