declare module '../../../grid/src/accounts.js' {
  export function getAccountBalances(accountId: string): Promise<any>;
  export function getTransfers(accountId: string, params?: any): Promise<any>;
}

export interface PaymentIntentResponse {
  amount: string;
  created_at: string;
  currency: string;
  destination: Record<string, unknown>;
  id: string;
  payment_rail?: string;
  source: Record<string, unknown>;
  status: string;
  transaction_signers: string[];
  valid_until?: string;
  kms_payloads?: Array<Record<string, unknown>>;
  transaction?: string | null;
  memo?: string | null;
}

