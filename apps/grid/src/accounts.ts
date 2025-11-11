import type { GridClient } from '@sqds/grid';
import { withGridClient } from './gridClient.js';

type CreateAccountInput = Parameters<GridClient['createAccount']>[0];
type CreateAccountResult = Awaited<ReturnType<GridClient['createAccount']>>;

type CompleteAccountInput = Parameters<GridClient['completeAuthAndCreateAccount']>[0];
type CompleteAccountResult = Awaited<ReturnType<GridClient['completeAuthAndCreateAccount']>>;

type GenerateSessionSecretsResult = Awaited<ReturnType<GridClient['generateSessionSecrets']>>;

type GetAddressesInput = Parameters<GridClient['getAccountAddresses']>[1];
type GetAddressesResult = Awaited<ReturnType<GridClient['getAccountAddresses']>>;

type GetBalancesResult = Awaited<ReturnType<GridClient['getAccountBalances']>>;

type GetTransfersInput = Parameters<GridClient['getTransfers']>[1];
type GetTransfersResult = Awaited<ReturnType<GridClient['getTransfers']>>;

type CreateSpendingLimitInput = Parameters<GridClient['createSpendingLimit']>[1];
type CreateSpendingLimitResult = Awaited<ReturnType<GridClient['createSpendingLimit']>>;

export async function createAccount(input: CreateAccountInput): Promise<CreateAccountResult> {
  return withGridClient((client) => client.createAccount(input));
}

export async function generateSessionSecrets(): Promise<GenerateSessionSecretsResult> {
  return withGridClient((client) => client.generateSessionSecrets());
}

export async function completeAuthAndCreateAccount(
  input: CompleteAccountInput
): Promise<CompleteAccountResult> {
  return withGridClient((client) => client.completeAuthAndCreateAccount(input));
}

export async function getAccountAddresses(
  accountId: string,
  params?: GetAddressesInput
): Promise<GetAddressesResult> {
  return withGridClient((client) => client.getAccountAddresses(accountId, params));
}

export async function getAccountBalances(accountId: string): Promise<GetBalancesResult> {
  return withGridClient((client) => client.getAccountBalances(accountId));
}

export async function getTransfers(
  accountId: string,
  params?: GetTransfersInput
): Promise<GetTransfersResult> {
  return withGridClient((client) => client.getTransfers(accountId, params));
}

export async function createSpendingLimit(
  accountId: string,
  payload: CreateSpendingLimitInput
): Promise<CreateSpendingLimitResult> {
  return withGridClient((client) => client.createSpendingLimit(accountId, payload));
}

