import { getSettings, getPositions, setPositions, addTrade, getSolUsd, dexNewPairs, rugcheckToken, passesSafetyChecks, getBotKeypair, getConnection, jupSwap, usdToLamports, pickTradeSizeUsd } from "./_shared/util.js";
import { schedule } from "@netlify/functions";
const SOL_MINT = "So11111111111111111111111111111111111111112";

export const handler = schedule("*/1 * * * *", async () => {
  const settings = await getSettings();
  if (!settings.run) return { statusCode: 200, body: "Bot paused." };

  const conn = getConnection();
  const kp = getBotKeypair();
  const solUsd = await getSolUsd();

  const balLamports = await conn.getBalance(kp.publicKey, "processed");
  const walletSol = balLamports / 1e9;
  const walletUsd = walletSol * solUsd;

  let positions = await getPositions();
  const now = Date.now();
  const updated = [];
  for (const pos of positions) {
    const ageMin = (now - pos.ts) / 60000;
    if (ageMin > (pos.timeStopMin ?? 60)) {
      await addTrade({ tsOpen: pos.ts, tsClose: now, mint: pos.mint, sizeUsd: pos.sizeUsd, pnlUsd: -Math.abs(pos.sizeUsd * 0.002) });
    } else updated.push(pos);
  }
  await setPositions(updated);

  const pairs = await dexNewPairs();
  const candidates = pairs
    .filter(p => p?.baseToken?.address && p?.priceChange?.m5 !== undefined)
    .map(p => ({ mint: p.baseToken.address, symbol: p.baseToken.symbol, m5:+(p.priceChange.m5||0), h1:+(p.priceChange.h1||0) }))
    .sort((a,b)=> (b.m5+b.h1)-(a.m5+a.h1))
    .slice(0,5);

  for (const c of candidates) {
    try {
      const rc = await rugcheckToken(c.mint);
      if (!passesSafetyChecks(rc)) continue;
      const sizeUsd = pickTradeSizeUsd(settings.mode, settings.customUsd, walletUsd);
      if (sizeUsd < 0.05) continue;
      const amountInLamports = usdToLamports(sizeUsd, solUsd);
      try {
        const sig = await jupSwap({ inputMint: SOL_MINT, outputMint: c.mint, amountIn: amountInLamports, slippageBps: 10 });
        const pos = { mint: c.mint, symbol: c.symbol, entrySig: sig, ts: Date.now(), sizeUsd, timeStopMin: 60 };
        const cur = await getPositions(); cur.push(pos); await setPositions(cur);
      } catch (e) { console.log("Swap failed", e?.message || e); }
    } catch {}
  }

  return { statusCode: 200, body: "Tick complete." };
});
