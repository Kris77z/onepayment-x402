import { config as loadEnv } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const candidateBaseDir = path.resolve(process.cwd(), 'apps/grid');
const BASE_DIR = fs.existsSync(candidateBaseDir) ? candidateBaseDir : path.resolve(scriptDir, '..');
const ENV_PATHS = [
  '../../.env.local',
  '../../.env',
  '../.env',
  '.env'
];

for (const relative of ENV_PATHS) {
  const absolute = path.resolve(BASE_DIR, relative);
  if (fs.existsSync(absolute)) {
    loadEnv({ path: absolute, override: false });
  }
}

const apiKey = process.env.GRID_API_KEY;
if (!apiKey) {
  console.error('Missing GRID_API_KEY in environment');
  process.exit(1);
}

const environment = process.env.GRID_ENVIRONMENT ?? 'sandbox';
const [, , ...argv] = process.argv;

if (argv.length === 0) {
  console.error('Usage: node scripts/create-signer-account.mjs <publicKey> [--threshold=1] [--permissions=Initiate,Vote,Execute] [--memo="..."]');
  process.exit(1);
}

const publicKey = argv[0];

let threshold = 1;
let permissions = ['Initiate', 'Vote', 'Execute'];
let memo;

for (const arg of argv.slice(1)) {
  if (arg.startsWith('--threshold=')) {
    threshold = Number.parseInt(arg.split('=')[1], 10);
    if (!Number.isInteger(threshold) || threshold <= 0) {
      console.error('Invalid threshold value');
      process.exit(1);
    }
  } else if (arg.startsWith('--permissions=')) {
    permissions = arg
      .split('=')[1]
      .split(',')
      .map((perm) => perm.trim())
      .filter(Boolean);
    if (permissions.length === 0) {
      console.error('Permissions list cannot be empty');
      process.exit(1);
    }
  } else if (arg.startsWith('--memo=')) {
    memo = arg.replace('--memo=', '');
  }
}

const body = {
  type: 'signers',
  memo,
  policies: {
    threshold,
    signers: [
      {
        address: publicKey,
        permissions
      }
    ]
  }
};

async function main() {
  const response = await fetch('https://grid.squads.xyz/api/grid/v1/accounts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'x-grid-environment': environment
    },
    body: JSON.stringify(body)
  });

  const json = await response.json();

  if (!response.ok) {
    console.error('Grid API error:', response.status, response.statusText);
    console.error(JSON.stringify(json, null, 2));
    process.exit(1);
  }

  console.log('Grid account creation response:');
  console.log(JSON.stringify(json, null, 2));
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
