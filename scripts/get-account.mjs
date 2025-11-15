import 'dotenv/config';

const GRID_API_KEY = process.env.GRID_API_KEY;
const GRID_ENVIRONMENT = process.env.GRID_ENVIRONMENT || 'sandbox';
const GRID_BASE_URL = process.env.GRID_BASE_URL || 'https://grid.squads.xyz';
const ACCOUNT_ID = process.argv[2] || process.env.MERCHANT_GRID_ACCOUNT_ID;

if (!GRID_API_KEY) {
  console.error('Missing GRID_API_KEY in environment');
  process.exit(1);
}

if (!ACCOUNT_ID) {
  console.error('Usage: node scripts/get-account.mjs <account_id>');
  process.exit(1);
}

const url = new URL(`/api/grid/v1/accounts/${ACCOUNT_ID}`, GRID_BASE_URL);

fetch(url, {
  headers: {
    Authorization: `Bearer ${GRID_API_KEY}`,
    'Content-Type': 'application/json',
    'x-grid-environment': GRID_ENVIRONMENT
  }
})
  .then(async (res) => {
    const text = await res.text();
    console.log('Status:', res.status);
    console.log('Raw body:', text);
    if (text) {
      try {
        const json = JSON.parse(text);
        console.log('Parsed JSON:', JSON.stringify(json, null, 2));
      } catch (err) {
        console.error('Failed to parse JSON:', err.message);
      }
    }
  })
  .catch((err) => {
    console.error('Fetch failed', err);
    process.exit(1);
  });
