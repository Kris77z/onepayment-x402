import { createRequire } from 'module';

const require = createRequire(import.meta.url);

type GridAccountsModule = {
  getAccountBalances: (accountId: string) => Promise<any>;
  getTransfers: (accountId: string, params?: any) => Promise<any>;
};

function loadGridAccounts(): GridAccountsModule {
  const module = require('../../../grid/src/accounts.js') as GridAccountsModule | undefined;
  if (!module) {
    throw new Error('Failed to load Grid accounts module');
  }
  return module;
}

function assertSuccess(result: any, action: string): any {
  if (!result) {
    throw new Error(`Grid response empty for ${action}`);
  }

  if (result.success === false) {
    const message = typeof result.error === 'string' ? result.error : 'Unknown Grid error';
    throw new Error(`${action} failed: ${message}`);
  }

  return 'data' in result && result.data !== undefined ? result.data : result;
}

export async function fetchAccountBalances(accountId: string): Promise<any> {
  const { getAccountBalances } = loadGridAccounts();
  const response = await getAccountBalances(accountId);
  return assertSuccess(response, 'getAccountBalances');
}

export async function fetchAccountTransfers(accountId: string, params?: { limit?: number }): Promise<any> {
  const { getTransfers } = loadGridAccounts();
  const response = await getTransfers(accountId, params);
  return assertSuccess(response, 'getTransfers');
}

