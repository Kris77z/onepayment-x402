/**
 * Facilitator 响应类型定义
 * 借鉴 PayAI Network facilitator 的标准化响应格式
 */

/**
 * Verify 响应
 * @typedef {Object} VerifyResponse
 * @property {boolean} isValid - 验证是否通过
 * @property {string} [invalidReason] - 验证失败的原因（标准错误码）
 * @property {string} [error] - 错误消息（用于调试）
 */

/**
 * Settle 响应
 * @typedef {Object} SettleResponse
 * @property {string} status - 结算状态：'settled' | 'error'
 * @property {string} [transactionSignature] - 交易签名（成功时）
 * @property {string} [errorReason] - 错误原因（标准错误码）
 * @property {string} [error] - 错误消息（用于调试）
 */

/**
 * Supported Payment Kinds 响应
 * @typedef {Object} SupportedPaymentKindsResponse
 * @property {string} protocol - 协议名称
 * @property {string} version - 协议版本
 * @property {Object} paymentKinds - 支持的支付类型
 */

/**
 * 标准错误码（参考 x402 协议）
 */
export const ErrorReasons = {
  INVALID_SIGNATURE: 'invalid_signature',
  INVALID_PAYLOAD: 'invalid_payload',
  INVALID_AMOUNT: 'invalid_amount',
  INVALID_RECIPIENT: 'invalid_recipient',
  EXPIRED: 'expired',
  INVALID_TIMESTAMP: 'invalid_timestamp',
  INVALID_TRANSACTION: 'invalid_transaction',
  NETWORK_ERROR: 'network_error',
  UNEXPECTED_ERROR: 'unexpected_error',
};

/**
 * 创建标准化的 VerifyResponse
 */
export function createVerifyResponse(isValid, errorReason = null, errorMessage = null) {
  const response = { isValid };
  if (!isValid) {
    if (errorReason) response.invalidReason = errorReason;
    if (errorMessage) response.error = errorMessage;
  }
  return response;
}

/**
 * 创建标准化的 SettleResponse
 */
export function createSettleResponse(status, transactionSignature = null, errorReason = null, errorMessage = null) {
  const response = { status };
  if (status === 'settled' && transactionSignature) {
    response.transactionSignature = transactionSignature;
  }
  if (status === 'error') {
    if (errorReason) response.errorReason = errorReason;
    if (errorMessage) response.error = errorMessage;
  }
  return response;
}

