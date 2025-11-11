import { argv, exit } from 'process';
import { generateQuote, latestRateSnapshot } from '../src/rate/agent.js';

async function main(): Promise<void> {
  const amountArg = argv[2];
  const amount = amountArg ? Number(amountArg) : null;

  if (amountArg && (!Number.isFinite(amount) || amount! <= 0)) {
    console.error('[fetch-rate] Amount must be a positive number expressed in minor units (e.g. 1000000 for 1 USDC)');
    exit(1);
    return;
  }

  const snapshot = await latestRateSnapshot();
  console.log('🌐 Switchboard rate snapshot');
  console.table({
    feedId: snapshot.feedId,
    network: snapshot.network,
    rate: snapshot.rate,
    rateSource: snapshot.rateSource,
    slot: snapshot.slot ?? 'n/a',
    fetchedAt: snapshot.fetchedAt,
    expiresAt: snapshot.expiresAt
  });

  if (amount) {
    const quote = await generateQuote(amount, 'USDC');
    console.log('\n🧮 Quote details');
    console.table({
      quoteId: quote.quoteId,
      inputAmount: quote.inputAmount,
      quotedAmountUsd: quote.quotedAmountUsd,
      rate: quote.rate,
      rateSource: quote.rateSource,
      quoteExpiresAt: quote.quoteExpiresAt,
      fetchedAt: quote.fetchedAt
    });
  }
}

main().catch((error) => {
  console.error('[fetch-rate] Failed to retrieve rate:', error);
  exit(1);
});


