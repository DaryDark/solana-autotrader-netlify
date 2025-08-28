import {
  getSettings,
  getPositions,
  setPositions,
  addTrade,
  getSolusd,
  dexNewPairs,
  rugcheckToken,
  passesSafetyChecks,
  getBotKeypair,    // ✅ from util.js
  getConnection     // ✅ from util.js
} from "./_shared/util.js";

import { schedule } from "@netlify/functions";

const SOL_MINT = "So11111111111111111111111111111111111111112";

export const handler = schedule("*/1 * * * *", async () => {
  try {
    // load settings
    const settings = await getSettings();
    if (!settings.run) {
      return { statusCode: 200, body: "Bot paused." };
    }

    // connect to Solana
    const conn = getConnection();
    const kp = getBotKeypair();
    const solUsd = await getSolusd();

    // wallet balance
    const balLamports = await conn.getBalance(kp.publicKey, "processed");
    const walletSol = balLamports / 1e9;
    const walletUsd = walletSol * solUsd;

    console.log(`Wallet balance: ${walletSol} SOL (~$${walletUsd})`);

    // fetch new pairs
    const pairs = await dexNewPairs();
    console.log(`Found ${pairs.length} new pairs`);

    for (const pair of pairs) {
      try {
        // Rugcheck
        const rugResult = await rugcheckToken(pair.mint);
        if (!passesSafetyChecks(rugResult)) {
          console.log(`❌ Skipping ${pair.symbol} (${pair.mint}) - unsafe`);
          continue;
        }

        console.log(`✅ Safe token detected: ${pair.symbol} (${pair.mint})`);

        // record position
        const positions = await getPositions();
        positions.push({
          mint: pair.mint,
          symbol: pair.symbol,
          boughtAt: Date.now(),
          amount: 0, // TODO: update with buy amount
        });
        await setPositions(positions);

        // add trade log
        await addTrade({
          type: "BUY",
          mint: pair.mint,
          symbol: pair.symbol,
          timestamp: Date.now(),
        });

      } catch (err) {
        console.error("Error processing pair:", pair, err);
      }
    }

    return {
      statusCode: 200,
      body: "Trader run complete",
    };
  } catch (e) {
    console.error("Trader error:", e);
    return {
      statusCode: 500,
      body: `Trader error: ${e.message}`,
    };
  }
});
