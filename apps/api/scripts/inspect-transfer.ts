#!/usr/bin/env ts-node
import { getConfig } from '../src/config.js';

async function main(): Promise<void> {
  const config = getConfig();
  const [fromArg, toArg, amountArg] = process.argv.slice(2);

  const fromAccountId = fromArg ?? config.MERCHANT_GRID_ACCOUNT_ID;
  const toAccountId = toArg ?? config.COMMISSION_GRID_ACCOUNT_ID;
  const amount = amountArg ? Number.parseInt(amountArg, 10) : 1;

  if (!fromAccountId || !toAccountId) {
    console.error('Missing from/to account IDs. Pass them as arguments or set MERCHANT_GRID_ACCOUNT_ID / COMMISSION_GRID_ACCOUNT_ID.');
    process.exitCode = 1;
    return;
  }

  if (!config.GRID_API_KEY) {
    console.error('GRID_API_KEY is not configured.');
    process.exitCode = 1;
    return;
  }

  const baseUrl = config.GRID_BASE_URL ?? 'https://grid.squads.xyz';
  const endpoint = new URL(`/api/grid/v1/accounts/${fromAccountId}/transfers`, baseUrl);

  const payload = {
    amount: {
      currency: 'USDC',
      value: amount.toString()
    },
    destination: {
      type: 'account',
      address: toAccountId
    },
    memo: 'commission transfer inspection'
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.GRID_API_KEY}`
  };

  if (config.GRID_ENVIRONMENT) {
    headers['x-grid-environment'] = config.GRID_ENVIRONMENT;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  const responseText = await response.text();
  const maybeJson = safeParseJson(responseText);

  const inspection = {
    request: {
      endpoint: endpoint.toString(),
      payload
    },
    response: {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
      body: maybeJson ?? responseText
    }
  };

  console.log(JSON.stringify(inspection, null, 2));
}

function safeParseJson(input: string): unknown | null {
  if (!input) {
    return null;
  }
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

void main();

