import { config as loadEnv } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { z } from 'zod';
const ENV_PATHS = [
    '.env',
    '../.env',
    '../../.env'
];
for (const candidate of ENV_PATHS) {
    const absolute = resolve(process.cwd(), candidate);
    if (existsSync(absolute)) {
        loadEnv({ path: absolute, override: false });
    }
}
const envSchema = z.object({
    GRID_API_KEY: z.string().min(1, 'Missing GRID_API_KEY in environment'),
    GRID_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
    GRID_BASE_URL: z
        .string()
        .url()
        .default('https://grid.squads.xyz'),
    SOLANA_RPC_URL: z
        .string()
        .url()
        .optional(),
    SOLANA_WS_URL: z
        .string()
        .url()
        .optional(),
    REQUEST_TIMEOUT_MS: z
        .coerce
        .number()
        .int()
        .positive()
        .default(30000)
});
let cachedConfig = null;
export function getConfig() {
    if (cachedConfig) {
        return cachedConfig;
    }
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
        const formatted = parsed.error.format();
        throw new Error(`Invalid environment configuration. Details: ${JSON.stringify(formatted, null, 2)}`);
    }
    cachedConfig = parsed.data;
    return cachedConfig;
}
