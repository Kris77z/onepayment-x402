import 'dotenv/config';
import bs58 from 'bs58';
import { Keypair } from '@solana/web3.js';

const GRID_API_KEY = process.env.GRID_API_KEY;
const GRID_ENVIRONMENT = process.env.GRID_ENVIRONMENT || 'sandbox';
const GRID_BASE_URL = process.env.GRID_BASE_URL || 'https://grid.squads.xyz';
const GRID_USER_ID = process.env.GRID_USER_ID;

if (!GRID_API_KEY) {
  console.error('Missing GRID_API_KEY in environment');
  process.exit(1);
}

if (!GRID_USER_ID) {
  console.error('Missing GRID_USER_ID in environment');
  process.exit(1);
}

if (GRID_ENVIRONMENT !== 'sandbox') {
  console.warn(`Warning: GRID_ENVIRONMENT is '${GRID_ENVIRONMENT}'. Proceeding anyway.`);
}

function generateSigner() {
  const kp = Keypair.generate();
  return {
    keypair: kp,
    publicKey: kp.publicKey.toBase58(),
    privateKey: bs58.encode(kp.secretKey)
  };
}

async function createAccount({ label, signerPubkey }) {
  const url = new URL('/api/grid/v1/accounts', GRID_BASE_URL);
  const body = {
    grid_user_id: GRID_USER_ID,
    label,
    type: 'signers',
    policies: {
      threshold: 1,
      admin_address: null,
      timelock: null,
      signers: [
        {
          address: signerPubkey,
          permissions: ['CAN_INITIATE', 'CAN_VOTE', 'CAN_EXECUTE'],
          role: 'primary'
        }
      ]
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GRID_API_KEY}`,
      'x-grid-environment': GRID_ENVIRONMENT
    },
    body: JSON.stringify(body)
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(`Failed to create account (${label}): ${res.status} ${JSON.stringify(json)}`);
  }

  return json?.data ?? json;
}

async function main() {
  console.log('Creating sandbox signer & accounts...');

  const signer = generateSigner();
  console.log('Signer generated:', signer.publicKey);

  const merchantAccount = await createAccount({
    label: 'PayAgent Merchant (Sandbox)',
    signerPubkey: signer.publicKey
  });

  const commissionAccount = await createAccount({
    label: 'PayAgent Commission (Sandbox)',
    signerPubkey: signer.publicKey
  });

  console.log('\n=== Sandbox Account Details ===');
  console.log('Signer Public Key:', signer.publicKey);
  console.log('Signer Private Key (base58, keep secret!):', signer.privateKey);
  console.log('\nMerchant Account:');
  console.log(JSON.stringify(merchantAccount, null, 2));
  console.log('\nCommission Account:');
  console.log(JSON.stringify(commissionAccount, null, 2));
}

main().catch((err) => {
  console.error('Error creating sandbox accounts:', err);
  process.exit(1);
});
