import { GridClient } from '@sqds/grid';
import { getConfig } from '../config.js';

let gridClientSingleton: GridClient | null = null;

export function getGridClient(): GridClient {
  if (gridClientSingleton) {
    return gridClientSingleton;
  }

  const config = getConfig();

  if (!config.GRID_API_KEY) {
    throw new Error('GRID_API_KEY is not configured');
  }

  const environment = config.GRID_ENVIRONMENT ?? 'sandbox';
  const baseUrl = config.GRID_BASE_URL ?? 'https://grid.squads.xyz';

  gridClientSingleton = new GridClient({
    apiKey: config.GRID_API_KEY,
    environment,
    baseUrl,
    solanaRpcUrl: config.SOLANA_RPC_URL
  });

  return gridClientSingleton;
}

