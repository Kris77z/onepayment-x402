require('dotenv').config();
const bs58 = require('bs58');
const { Connection, VersionedTransaction, Transaction, Keypair } = require('@solana/web3.js');

const decode = typeof bs58.decode === 'function' ? bs58.decode : bs58.default?.decode;
if (!decode) {
  console.error('Unable to find bs58.decode');
  process.exit(1);
}

const txBase64 = process.env.GRID_INTENT_BASE64;
if (!txBase64) {
  console.error('Missing GRID_INTENT_BASE64 in environment');
  process.exit(1);
}

const privateKeyBase58 = process.env.GRID_SIGNER_PRIVATE_KEY;
if (!privateKeyBase58) {
  console.error('Missing GRID_SIGNER_PRIVATE_KEY in environment');
  process.exit(1);
}

(async () => {
  try {
    const secret = decode(privateKeyBase58);
    const signer = Keypair.fromSecretKey(secret);
    const raw = Buffer.from(txBase64, 'base64');
    let serialized;
    try {
      const versioned = VersionedTransaction.deserialize(raw);
      versioned.sign([signer]);
      serialized = versioned.serialize();
    } catch (legacyErr) {
      const legacy = Transaction.from(raw);
      legacy.partialSign(signer);
      serialized = legacy.serialize({ requireAllSignatures: false, verifySignatures: false });
    }

    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, { commitment: 'confirmed' });
    const signature = await connection.sendRawTransaction(serialized, {
      skipPreflight: false
    });
    console.log('Transaction signature:', signature);
    const confirmation = await connection.confirmTransaction({ signature, commitment: 'confirmed' });
    console.log('Confirmation status:', confirmation);
  } catch (error) {
    console.error('Failed to sign/send intent:', error);
    process.exit(1);
  }
})();
