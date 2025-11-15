import 'dotenv/config';
import bs58 from 'bs58';
import { GridClient } from '@sqds/grid';
import { readFileSync } from 'node:fs';

const apiKey = process.env.GRID_API_KEY;
if (!apiKey) {
  console.error('Missing GRID_API_KEY in environment');
  process.exit(1);
}

const environment = process.env.GRID_ENVIRONMENT || 'sandbox';

const rlKey = process.argv[2];
let publicKey = rlKey;

if (!publicKey) {
  try {
    const json = JSON.parse(readFileSync('signer.json', 'utf-8'));
    publicKey = json.publicKey;
  } catch {
    console.error('Usage: node scripts/create-sandbox-account-with-signer.mjs <publicKey>');
    process.exit(1);
  }
}

const gridClient = new GridClient({
  environment,
  apiKey,
  baseUrl: process.env.GRID_BASE_URL || 'https://grid.squads.xyz'
});

const body = { signer: publicKey };

const result = await gridClient.createAccount(body);
console.log(JSON.stringify(result, null, 2));
