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

const rateSchema = z.object({
  SOLANA_RPC_URL: z.string().url().default('https://api.devnet.solana.com'),
  SWITCHBOARD_FEED_ID: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'SWITCHBOARD_FEED_ID must be 64 hex characters'),
  SWITCHBOARD_FEED_ID_USDT: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/)
    .optional(),
  SWITCHBOARD_CROSSBAR_URL: z
    .string()
    .url()
    .default('https://crossbar.switchboard.xyz'),
  SWITCHBOARD_NETWORK: z.enum(['devnet', 'mainnet', 'testnet', 'localnet']).default('devnet'),
  USD_FALLBACK_RATE: z
    .preprocess(
      (value) => {
        if (value === undefined || value === null) {
          return undefined;
        }
        if (typeof value === 'string' && value.trim() === '') {
          return undefined;
        }
        return value;
      },
      z.coerce.number().positive().optional()
    ),
  RATE_CACHE_TTL_MS: z.coerce.number().int().positive().default(30_000)
});

export type RateServiceConfig = z.infer<typeof rateSchema>;

let cachedRateConfig: RateServiceConfig | null = null;

export function getRateConfig(): RateServiceConfig {
  if (cachedRateConfig) {
    return cachedRateConfig;
  }

  const result = rateSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.format();
    throw new Error(`Invalid rate service configuration: ${JSON.stringify(formatted, null, 2)}`);
  }

  cachedRateConfig = result.data;
  return cachedRateConfig;
}


