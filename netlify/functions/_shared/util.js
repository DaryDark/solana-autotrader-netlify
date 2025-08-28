import { getStore } from "@netlify/blobs";
import bs58 from "bs58";
import { Connection, Keypair, VersionedTransaction, PublicKey, SystemProgram, Transaction, TransactionMessage } from "@solana/web3.js";

export const SETTINGS_KEY = "settings.json";
export const POSITIONS_KEY = "positions.json";
export const TRADES_KEY = "trades.json";

export function store() { return getStore({ name: "bot" }); }

export async function getSettings() {
  const s = await store().get(SETTINGS_KEY, { type: "json" });
  return s || { run: false, mode: "safe", customUsd: 1, theme: "dark", telegramChatId: null, lastUpdated: Date.now() };
}

export async function setSettings(patch) {
  const next = { ...(await getSettings()), ...patch, lastUpdated: Date.now() };
  await store().set(SETTINGS_KEY, JSON.stringify(next), { addRandomSuffix: false });
  return next;
}

export async function getPositions() { return (await store().get(POSITIONS_KEY, { type: "json" })) || []; }
export async function setPositions(arr) { await store().set(POSITIONS_KEY, JSON.stringify(arr), { addRandomSuffix: false }); }
export async function getTrades() { return (await store().get(TRADES_KEY, { type: "json" })) || []; }
export async function addTrade(t) { const a = await getTrades(); a.push(t); await store().set(TRADES_KEY, JSON.stringify(a), { addRandomSuffix: false }); }

export function env(k, f=undefined){ return process.env[k] ?? f; }

const BIRDEYE = "https://public-api.birdeye.so";
const DEXSCREENER = "https://api.dexscreener.com";

export async function fetchJson(url, opts = {}) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return await r.json();
}

export async function getSolUsd() {
  const wsol = "So11111111111111111111111111111111111111112";
  const k = env("BIRDEYE_API_KEY");
  const d = await fetchJson(`${BIRDEYE}/defi/price?address=${wsol}`, { headers: { "X-API-KEY": k || "" } });
  return d?.data?.value || 150;
}

export async function dexNewPairs() {
  const d = await fetchJson(`${DEXSCREENER}/latest/dex/pairs/solana`);
  return (d?.pairs || []).slice(0, 30);
}

export async function rugcheckToken(mint) {
  try { return await fetchJson(`https://api.rugcheck.xyz/v1/tokens/${mint}`); }
  catch { return null; }
}

export function passesSafetyChecks(rc) {
  if (!rc) return false;
  const score = rc?.score ?? 0;
  const honey = rc?.isHoneypot ?? false;
  const canFreeze = rc?.canFreeze ?? true;
  return score >= 70 && !honey && !canFreeze;
}

export function getBotKeypair() {
  const raw = env("BOT_PRIVATE_KEY");
  if (!raw) throw new Error("BOT_PRIVATE_KEY not set");
  let arr;
  try { arr = JSON.parse(raw); } catch { try { arr = Array.from(bs58.decode(raw)); } catch { throw new Error("BOT_PRIVATE_KEY must be JSON array or base58"); } }
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

export function getConnection() {
  const url = env("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com");
  return new Connection(url, "confirmed");
}

// Jupiter Lite (no key)
const JUP = "https://lite-api.jup.ag";

export async function jupSwap({ inputMint, outputMint, amountIn, slippageBps = 10 }) {
  const q = new URL(`${JUP}/swap/v1/quote`);
  q.searchParams.set("inputMint", inputMint);
  q.searchParams.set("outputMint", outputMint);
  q.searchParams.set("amount", String(amountIn));
  q.searchParams.set("slippageBps", String(slippageBps));
  const quote = await fetchJson(q.toString());
  const swap = await fetchJson(`${JUP}/swap/v1/swap`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ quoteResponse: quote, userPublicKey: getBotKeypair().publicKey.toBase58() })
  });
  const tx = VersionedTransaction.deserialize(Buffer.from(swap.swapTransaction, "base64"));
  tx.sign([getBotKeypair()]);
  const sig = await getConnection().sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 3 });
  return sig;
}

export function usdToLamports(usd, solUsd){ return Math.floor((usd/solUsd)*1e9); }

export function pickTradeSizeUsd(mode, customUsd, walletUsd){
  const cap = walletUsd * 0.10;
  if (mode === "custom") return Math.max(0.01, Math.min(customUsd, cap));
  const ranges = { safe:[0.10,1], medium:[5,50], aggressive:[100,500] };
  const [mn,mx] = ranges[mode] || ranges.safe;
  const mxc = Math.min(mx, cap);
  if (mxc < mn) return mxc;
  return (mn + mxc)/2;
}

export async function sendTelegramPhoto({ chatId, title="Trade Update", subtitle="", valueText="" }){
  const token = env("TELEGRAM_BOT_TOKEN");
  if (!token || !chatId) return { ok:false, message:"Missing TELEGRAM_BOT_TOKEN or chatId" };
  const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify({
    type:"bar", data:{labels:[title], datasets:[{data:[1]}]},
    options:{plugins:{title:{display:true,text:`${subtitle} ${valueText}`}}, scales:{y:{display:false}}}
  }))}`;
  const url = `https://api.telegram.org/bot${token}/sendPhoto`;
  const r = await fetch(url, { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({ chat_id: chatId, photo: chartUrl, caption: `${title}\n${subtitle}\n${valueText}` }) });
  return await r.json();
}
