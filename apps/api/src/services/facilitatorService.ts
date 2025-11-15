import { getConfig } from '../config.js';

interface FacilitatorResponse<T> {
  success: boolean;
  data: T | null;
  error?: unknown;
}

/**
 * Verify 响应（与 facilitator 响应格式一致）
 * 借鉴 PayAI Network facilitator 的标准化响应格式
 */
interface VerifyResponse {
  isValid: boolean;
  invalidReason?: string; // 标准错误码（如 'invalid_signature', 'expired' 等）
  error?: string; // 错误消息（用于调试）
}

/**
 * Settle 响应（与 facilitator 响应格式一致）
 * 借鉴 PayAI Network facilitator 的标准化响应格式
 */
interface SettleResponse {
  status: 'settled' | 'error';
  transactionSignature?: string; // 交易签名（成功时）
  errorReason?: string; // 标准错误码（失败时）
  error?: string; // 错误消息（用于调试）
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
    // 优先使用标准错误码，其次使用错误消息
    const errorMessage = verifyResponse.invalidReason 
      ? `验证失败: ${verifyResponse.invalidReason}${verifyResponse.error ? ` - ${verifyResponse.error}` : ''}`
      : verifyResponse.error ?? 'Facilitator verification failed';
    
    return {
      success: false,
      failureStage: 'verify',
      error: errorMessage
    };
  }

  const settleResponse = await settlePaymentRequest(paymentRequest);

  if (settleResponse.status !== 'settled') {
    // 优先使用标准错误码，其次使用错误消息
    const errorMessage = settleResponse.errorReason
      ? `结算失败: ${settleResponse.errorReason}${settleResponse.error ? ` - ${settleResponse.error}` : ''}`
      : settleResponse.error ?? 'Facilitator returned non-settled status';
    
    return {
      success: false,
      failureStage: 'settle',
      error: errorMessage
    };
  }

  return {
    success: true,
    transactionSignature: settleResponse.transactionSignature ?? null
  };
}

