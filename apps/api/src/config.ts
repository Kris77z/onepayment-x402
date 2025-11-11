import { config as loadEnv } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { z } from 'zod';

const ENV_CANDIDATES = ['.env', '../.env', '../../.env'];

for (const candidate of ENV_CANDIDATES) {
  const absolute = resolve(process.cwd(), candidate);
  if (existsSync(absolute)) {
    loadEnv({ path: absolute, override: false });
  }
}

const schema = z.object({
  API_PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FACILITATOR_URL: z.string().url().default('http://localhost:3001'),
  MERCHANT_SOLANA_ADDRESS: z.string().min(32).optional(),
  MERCHANT_GRID_ACCOUNT_ID: z.string().min(32).optional(),
  COMMISSION_SOLANA_ADDRESS: z.string().min(32).optional(),
  COMMISSION_GRID_ACCOUNT_ID: z.string().min(32).optional(),
  GRID_USER_ID: z.string().optional(),
  GRID_SIGNER_ADDRESS: z.string().optional(),
  GRID_SIGNER_PRIVATE_KEY: z.string().min(32).optional(),
  COMMISSION_BPS: z.coerce.number().int().min(0).max(10_000).default(500),
  GRID_API_KEY: z.string().optional(),
  GRID_ENVIRONMENT: z.enum(['sandbox', 'production']).optional(),
  GRID_BASE_URL: z.string().url().default('https://grid.squads.xyz'),
  SOLANA_RPC_URL: z.string().url().optional(),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30000)
});

export type ApiConfig = z.infer<typeof schema>;

let cached: ApiConfig | null = null;

export function getConfig(): ApiConfig {
  if (cached) {
    return cached;
  }

  const result = schema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.format();
    throw new Error(`Invalid API environment configuration: ${JSON.stringify(formatted, null, 2)}`);
  }

  cached = result.data;
  return cached;
}

