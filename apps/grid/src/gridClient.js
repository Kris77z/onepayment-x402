import { GridClient } from '@sqds/grid';
import { getConfig } from './config.js';
let singleton = null;
export function getGridClient() {
    if (singleton) {
        return singleton;
    }
    const { GRID_API_KEY, GRID_ENVIRONMENT, GRID_BASE_URL, REQUEST_TIMEOUT_MS } = getConfig();
    singleton = new GridClient({
        apiKey: GRID_API_KEY,
        environment: GRID_ENVIRONMENT,
        baseUrl: GRID_BASE_URL,
        timeout: REQUEST_TIMEOUT_MS
    });
    return singleton;
}
export async function withGridClient(handler) {
    const client = getGridClient();
    return handler(client);
}
