/**
 * X402 Solana Payment Script
 *
 * This script simulates the Paywall payment flow by:
 * 1. Building a Solana SPL Token transfer transaction
 * 2. Signing the transaction with a private key
 * 3. Encoding the signed transaction as X-PAYMENT header
 * 4. Retrying the request with X-PAYMENT to access protected content
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import bs58 from "bs58";

// Note: Node.js 18+ has built-in fetch, no need to import

// ============= CONFIGURATION =============

// Your Solana wallet private key (Base58 format)
// Read from environment variable for security
const PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY || "";

// Target URL to access (the protected resource)
const TARGET_URL = "http://localhost:3000/content/cheap";

// Payment configuration (should match your middleware setup)
const PAYMENT_CONFIG = {
  network: "solana-devnet",
  rpcEndpoint: "https://api.devnet.solana.com",

  // Receiver address (from middleware configuration)
  payTo: "CmGgLQL36Y9ubtTsy2zmE46TAxwCBm66onZmPPhUWNqv",

  // USDC token mint on Solana Devnet
  usdcMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",

  // Amount in smallest unit (0.01 USDC = 10000 in atomic units, 6 decimals)
  amount: "10000",

  // Fee payer (provided by facilitator)
  feePayer: "CKPKJWNdJEqa81x7CkZ14BVPiY6y16Sxs7owznqtWYp5",
};

// ============= HELPER FUNCTIONS =============

/**
 * Convert Base58 private key to Keypair
 */
function loadKeypairFromPrivateKey(privateKeyBase58: string): Keypair {
  const secretKey = bs58.decode(privateKeyBase58);
  return Keypair.fromSecretKey(secretKey);
}

/**
 * Build Solana SPL Token transfer transaction
 */
async function buildPaymentTransaction(
  connection: Connection,
  fromKeypair: Keypair,
  config: typeof PAYMENT_CONFIG
): Promise<Transaction> {
  console.log("\n📦 Building payment transaction...");

  const fromPubkey = fromKeypair.publicKey;
  const toPubkey = new PublicKey(config.payTo);
  const mintPubkey = new PublicKey(config.usdcMint);
  const feePayerPubkey = new PublicKey(config.feePayer);

  // Get associated token accounts
  const fromTokenAccount = await getAssociatedTokenAddress(
    mintPubkey,
    fromPubkey
  );

  const toTokenAccount = await getAssociatedTokenAddress(mintPubkey, toPubkey);

  console.log(`   From: ${fromPubkey.toBase58()}`);
  console.log(`   To: ${toPubkey.toBase58()}`);
  console.log(`   Amount: ${config.amount} (atomic units)`);

  // Create transfer instruction
  const transferInstruction = createTransferCheckedInstruction(
    fromTokenAccount, // source
    mintPubkey, // mint
    toTokenAccount, // destination
    fromPubkey, // owner
    BigInt(config.amount), // amount
    6 // decimals (USDC = 6)
  );

  // Build transaction with Compute Budget instructions
  const transaction = new Transaction();

  // Add Compute Budget instructions (required by X402)
  // 1. Set compute unit limit (200,000 units is typical for token transfers)
  transaction.add(
    ComputeBudgetProgram.setComputeUnitLimit({
      units: 200_000,
    })
  );

  // 2. Set compute unit price (priority fee, 0 for devnet is fine)
  transaction.add(
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 0,
    })
  );

  // 3. Add the transfer instruction
  transaction.add(transferInstruction);

  // Set fee payer
  transaction.feePayer = feePayerPubkey;

  // Get latest blockhash
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;

  console.log(
    `   ✅ Transaction built with blockhash: ${blockhash.substring(0, 8)}...`
  );

  return transaction;
}

/**
 * Sign transaction with wallet keypair
 */
function signTransaction(
  transaction: Transaction,
  keypair: Keypair
): Transaction {
  console.log("\n✍️  Signing transaction...");

  transaction.partialSign(keypair);

  console.log(`   ✅ Transaction signed by ${keypair.publicKey.toBase58()}`);

  return transaction;
}

/**
 * Encode signed transaction as X-PAYMENT header
 */
function encodeXPayment(
  signedTransaction: Transaction,
  config: typeof PAYMENT_CONFIG
): string {
  console.log("\n🔐 Encoding X-PAYMENT header...");

  // Serialize transaction
  const serialized = signedTransaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });

  // Build payment object (X402 Exact Scheme for Solana)
  const payment = {
    x402Version: 1,
    scheme: "exact",
    network: config.network,
    payload: {
      transaction: serialized.toString("base64"),
    },
  };

  // Encode to Base64
  const xPayment = Buffer.from(JSON.stringify(payment)).toString("base64");

  console.log(`   ✅ X-PAYMENT header generated (${xPayment.length} bytes)`);
  console.log(`   Preview: ${xPayment.substring(0, 60)}...`);

  // Debug: show decoded payment structure
  console.log(`\n   📋 Payment structure (for debugging):`);
  console.log(`   - X402 Version: ${payment.x402Version}`);
  console.log(`   - Scheme: ${payment.scheme}`);
  console.log(`   - Network: ${payment.network}`);
  console.log(`   - Transaction length: ${payment.payload.transaction.length} chars`);

  return xPayment;
}

/**
 * Retry request with X-PAYMENT header
 */
async function retryRequestWithPayment(xPayment: string): Promise<void> {
  console.log(`\n🚀 Retrying request to ${TARGET_URL}...`);
  console.log(`   Headers: X-PAYMENT (${xPayment.length} chars)\n`);

  try {
    const response = await fetch(TARGET_URL, {
      method: "GET",
      headers: {
        "X-PAYMENT": xPayment,
        Accept: "text/html",
        "User-Agent": "X402-Payment-Script/1.0",
      },
    });

    console.log(
      `📡 Response Status: ${response.status} ${response.statusText}\n`
    );

    // Check for X-PAYMENT-RESPONSE header
    const paymentResponse = response.headers.get("x-payment-response");
    if (paymentResponse) {
      const decoded = JSON.parse(
        Buffer.from(paymentResponse, "base64").toString("utf8")
      );
      console.log("✅ Payment Response:");
      console.log(JSON.stringify(decoded, null, 2));
      console.log("");
    }

    // Display response content
    if (response.ok) {
      const content = await response.text();
      console.log("✅ SUCCESS! Access granted to protected content.");
      console.log(`📄 Content preview (first 200 chars):\n`);
      console.log(content.substring(0, 200) + "...\n");

      if (paymentResponse) {
        const decoded = JSON.parse(
          Buffer.from(paymentResponse, "base64").toString("utf8")
        );
        console.log(`🔗 Transaction on Solana Explorer:`);
        console.log(
          `   https://explorer.solana.com/tx/${decoded.transaction}?cluster=devnet\n`
        );
      }
    } else if (response.status === 402) {
      const error = await response.json();
      console.log("❌ Payment Failed!");
      console.log(`   Error: ${typeof error.error === 'object' ? JSON.stringify(error.error, null, 2) : error.error}`);
      console.log(`   Full error response:`);
      console.log(JSON.stringify(error, null, 2));
      console.log("");
    } else {
      const errorText = await response.text();
      console.log(`❌ Request failed: ${errorText.substring(0, 200)}\n`);
    }
  } catch (error) {
    console.error("❌ Request error:", error);
    throw error;
  }
}

/**
 * Check wallet balance before payment
 */
async function checkBalance(
  connection: Connection,
  keypair: Keypair
): Promise<void> {
  console.log("\n💰 Checking wallet balance...");

  const publicKey = keypair.publicKey;
  const mintPubkey = new PublicKey(PAYMENT_CONFIG.usdcMint);

  try {
    // Check SOL balance
    const solBalance = await connection.getBalance(publicKey);
    console.log(`   SOL: ${solBalance / 1e9} SOL`);

    // Check USDC balance
    const tokenAccount = await getAssociatedTokenAddress(mintPubkey, publicKey);
    const tokenBalance = await connection.getTokenAccountBalance(tokenAccount);
    const usdcBalance = tokenBalance.value.uiAmount || 0;

    console.log(`   USDC: ${usdcBalance} USDC`);

    // Check if sufficient
    const requiredAmount = parseInt(PAYMENT_CONFIG.amount) / 1e6; // Convert to UI amount
    if (usdcBalance < requiredAmount) {
      console.log(`   ⚠️  WARNING: Insufficient USDC balance!`);
      console.log(`   Required: ${requiredAmount} USDC`);
      console.log(`   Available: ${usdcBalance} USDC`);
      console.log(`   Get testnet USDC at: https://faucet.circle.com/`);
      console.log("");
    } else {
      console.log(`   ✅ Sufficient balance for payment`);
    }
  } catch (error) {
    console.log(
      `   ⚠️  Could not fetch balance:`,
      error instanceof Error ? error.message : error
    );
  }
}

// ============= MAIN EXECUTION =============

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║         X402 Solana Payment Script (Devnet)              ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");

  try {
    // Validate configuration
    if (!PRIVATE_KEY) {
      throw new Error(
        "❌ Please set SOLANA_PRIVATE_KEY environment variable!\n\n" +
          "   Usage:\n" +
          "   SOLANA_PRIVATE_KEY='your_key_here' npm run payment\n\n" +
          "   Or create a .env file:\n" +
          "   echo 'SOLANA_PRIVATE_KEY=your_key_here' > .env\n\n" +
          "   You can export a key from Phantom wallet or generate a new one for testing."
      );
    }

    // 1. Load wallet from private key
    console.log("\n🔑 Loading wallet from private key...");
    const keypair = loadKeypairFromPrivateKey(PRIVATE_KEY);
    console.log(`   Wallet: ${keypair.publicKey.toBase58()}`);

    // 2. Connect to Solana
    console.log(`\n🌐 Connecting to Solana ${PAYMENT_CONFIG.network}...`);
    const connection = new Connection(PAYMENT_CONFIG.rpcEndpoint, "confirmed");
    const version = await connection.getVersion();
    console.log(`   ✅ Connected (Solana v${version["solana-core"]})`);

    // 3. Check balance
    await checkBalance(connection, keypair);

    // 4. Build transaction
    const transaction = await buildPaymentTransaction(
      connection,
      keypair,
      PAYMENT_CONFIG
    );

    // 5. Sign transaction
    const signedTransaction = signTransaction(transaction, keypair);

    // 6. Encode as X-PAYMENT
    const xPayment = encodeXPayment(signedTransaction, PAYMENT_CONFIG);

    // 7. Retry request with payment
    await retryRequestWithPayment(xPayment);

    console.log("✅ Payment flow completed!\n");
  } catch (error) {
    console.error(
      "\n❌ Error:",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
}

// Run the script
main();
