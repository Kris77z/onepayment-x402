#!/usr/bin/env node
import { createAccount, createSpendingLimit, getAccountAddresses, getAccountBalances, getTransfers, generateSessionSecrets } from './accounts.js';

type CommandHandler = (args: string[]) => Promise<void>;

const commands: Record<string, { description: string; handler: CommandHandler }> = {
  'accounts:create-signer': {
    description: 'Create Grid account using an existing signer public key',
    handler: async ([publicKey]) => {
      if (!publicKey) throw new Error('Usage: accounts:create-signer <base58_public_key>');
      const result = await createAccount({ signer: publicKey });
      printJson(result);
    }
  },
  'accounts:session-secrets': {
    description: 'Generate session secrets for email-based authentication flow',
    handler: async () => {
      const secrets = await generateSessionSecrets();
      printJson(secrets);
    }
  },
  'accounts:addresses': {
    description: 'List Solana addresses for a Grid account',
    handler: async ([accountId, chainArg]) => {
      if (!accountId) throw new Error('Usage: accounts:addresses <account_id> [--chain=solana]');
      const chain = parseChain(chainArg);
      const result = await getAccountAddresses(accountId, chain ? { chain } : undefined);
      printJson(result);
    }
  },
  'accounts:balances': {
    description: 'Fetch account balances',
    handler: async ([accountId]) => {
      if (!accountId) throw new Error('Usage: accounts:balances <account_id>');
      const balances = await getAccountBalances(accountId);
      printJson(balances);
    }
  },
  'accounts:transfers': {
    description: 'Fetch recent transfers',
    handler: async ([accountId, limitArg]) => {
      if (!accountId) throw new Error('Usage: accounts:transfers <account_id> [--limit=10]');
      const limit = parseNumberOption(limitArg, 'limit');
      const result = await getTransfers(accountId, limit ? { limit } : undefined);
      printJson(result);
    }
  },
  'accounts:transfers:by-signature': {
    description: 'Fetch transfer details by Solana transaction signature',
    handler: async ([accountId, signature]) => {
      if (!accountId || !signature) throw new Error('Usage: accounts:transfers:by-signature <account_id> <signature>');
      const response = await getTransfers(accountId, { tx_hash: signature, limit: 1 });
      const transfers = (response as { data?: unknown[] }).data ?? [];
      if (transfers.length === 0) {
        printJson([]);
        return;
      }
      printJson(transfers[0]);
    }
  },
  'accounts:create-spending-limit': {
    description: 'Create a spending limit policy for an account',
    handler: async ([accountId, amountArg, mint, periodArg, destinationsArg]) => {
      if (!accountId || !amountArg || !mint) {
        throw new Error(
          'Usage: accounts:create-spending-limit <account_id> <amount> <mint> [--period=one_time] [--dest=ADDRESS1,ADDRESS2]'
        );
      }

      const amount = BigInt(amountArg);
      const period = parseStringOption(periodArg, 'period') ?? 'one_time';
      const destinations = parseDestinations(destinationsArg);

      const payload = {
        amount,
        mint,
        period,
        destinations
      } as Parameters<typeof createSpendingLimit>[1];

      const result = await createSpendingLimit(accountId, payload);
      printJson(result);
    }
  }
};

async function run(): Promise<void> {
  const [, , command, ...args] = process.argv;

  if (!command || command === 'help' || command === '--help') {
    printUsage();
    return;
  }

  const entry = commands[command];
  if (!entry) {
    console.error(`Unknown command: ${command}\n`);
    printUsage();
    process.exitCode = 1;
    return;
  }

  try {
    await entry.handler(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exitCode = 1;
  }
}

function printUsage(): void {
  console.log('Grid Service CLI');
  console.log('Usage: npm run dev -- <command> [options]');
  console.log('Commands:');
  Object.entries(commands).forEach(([name, meta]) => {
    console.log(`  ${name.padEnd(30)} ${meta.description}`);
  });
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function parseChain(option?: string): { chain: string }['chain'] | undefined {
  if (!option) {
    return undefined;
  }

  const [key, value] = option.split('=');
  if (key === '--chain' && value) {
    return value;
  }

  throw new Error('Invalid chain option. Use --chain=solana');
}

function parseNumberOption(option: string | undefined, key: string): number | undefined {
  if (!option) {
    return undefined;
  }

  const [flag, raw] = option.split('=');
  if (flag !== `--${key}` || !raw) {
    throw new Error(`Invalid option. Use --${key}=<number>`);
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${key} value: ${raw}`);
  }

  return parsed;
}

function parseStringOption(option: string | undefined, key: string): string | undefined {
  if (!option) {
    return undefined;
  }

  const [flag, value] = option.split('=');
  if (flag !== `--${key}` || !value) {
    throw new Error(`Invalid option. Use --${key}=<value>`);
  }

  return value;
}

function parseDestinations(option: string | undefined): string[] {
  if (!option) {
    return [];
  }

  const [flag, raw] = option.split('=');
  if (flag !== '--dest' || !raw) {
    throw new Error('Invalid destination option. Use --dest=ADDR1,ADDR2');
  }

  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

await run();

