import { getConfig } from '../config.js';

export interface CommissionCalculationResult {
  totalAmount: number;
  commissionAmount: number;
  netAmount: number;
  commissionBps: number;
}

export function getCommissionBps(): number {
  const config = getConfig();
  return config.COMMISSION_BPS ?? 500;
}

export function calculateCommission(amount: number, commissionBps: number): CommissionCalculationResult {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(`Invalid amount for commission calculation: ${amount}`);
  }

  if (!Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > 10_000) {
    throw new Error(`Invalid commission basis points: ${commissionBps}`);
  }

  const totalAmount = amount;
  const amountBigInt = BigInt(totalAmount);
  const bpsBigInt = BigInt(commissionBps);

  const commissionAmount = Number((amountBigInt * bpsBigInt) / BigInt(10_000));
  const netAmount = totalAmount - commissionAmount;

  return {
    totalAmount,
    commissionAmount,
    netAmount,
    commissionBps
  };
}


