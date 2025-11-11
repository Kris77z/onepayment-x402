import { GridClient } from '@sqds/grid';
import type { GridEnvironment } from '@sqds/grid';
import { getConfig } from './config.js';

let singleton: GridClient | null = null;

export function getGridClient(): GridClient {
  if (singleton) {
    return singleton;
  }

  const { GRID_API_KEY, GRID_ENVIRONMENT, GRID_BASE_URL, REQUEST_TIMEOUT_MS } = getConfig();

  singleton = new GridClient({
    apiKey: GRID_API_KEY,
    environment: GRID_ENVIRONMENT as GridEnvironment,
    baseUrl: GRID_BASE_URL,
    timeout: REQUEST_TIMEOUT_MS
  });

  return singleton;
}

export async function withGridClient<T>(handler: (client: GridClient) => Promise<T>): Promise<T> {
  const client = getGridClient();
  return handler(client);
}

