import { getStore } from "@netlify/blobs";
import bs58 from "bs58";
import {
  Connection,
  Keypair,
  VersionedTransaction,
  PublicKey,
} from "@solana/web3.js";

/* ---------- Blob store & keys ---------- */
export const SETTINGS_KEY  = "settings.json";
export const POSITIONS_KEY = "positions.json";
export const TRADES_KEY    = "trades.json";

/** Netlify Blobs store (auto-created on first write) */
export function store() {
  return getStore("bot"); // <-- important: string form auto-creates store
}

/* ---------- Small helpers ---------- */
export function env(k, fallback = undefined) {
  return process.env[k] ?? fallback;
}

export async function fetchJson(url, opts = {}) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return await r.json();
}

/* ---------- Settings / Positions / Trades (Blobs) ---------- */
export async function getSettings() {
  const s = await store().get(SETTINGS_KEY, { type: "json" });
  return s ?? { run:false, mode:"safe", customUsd:1, theme:"dark", telegramChatId:null, lastUpdated:Date.now() };
}
export async function setSettings(patch) {
  const next = { ...(await getSettings()), ...patch, lastUpdated: Date.now() };
  await store().set(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

export async function getPositions() {
  return (await store().get(POSITIONS_KEY, { type: "json" })) ?? [];
}
export async function setPositions(arr) {
  await store().set(POSITIONS_KEY, JSON.stringify(arr));
}

export async function getTrades() {
  return (await store().get(TRADES_KEY, { type: "json" })) ?? [];
}
export async function addTrade(t) {
  const all = await getTrades();
  all.push(t);
  // keep last 200
  await store().set(TRADES_KEY, JSON.stringify(all.slice(-200)));
}

/* ---------- Market data & safety checks ---------- */
const BIRDEYE = "https://public-api.birdeye.so";
const DEXSCREENER = "https://api.dexscreener.com";

export async function getSolUsd() {
  const wsol = "So11111111111111111111111111111111111111112";
  const key = env("BIRDEYE_API_KEY");
  const d = await fetchJson(
    `${BIRDEYE}/defi/price?address=${wsol}`,
    { headers: { "X-API-KEY": key || "" } }
  );
  return d?.data?.value || 150; // fallback
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
  // basic guardrails
  return score >= 70 && !honey && !canFreeze;
}

/* ---------- Wallet / RPC ---------- */
export function getBotKeypair() {
  const raw = env("BOT_PRIVATE_KEY");
  if (!raw) throw new Error("BOT_PRIVATE_KEY not set");
  // Accept JSON array or base58
  try {
    const arr = JSON.parse(raw);
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  } catch {
    const arr = bs58.decode(raw);
    return Keypair.fromSecretKey(arr);
  }
}

export function getConnection() {
  const url = env("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com");
  return new Connection(url, "confirmed");
}

/* ---------- Jupiter Lite swap (no API key) ---------- */
const JUP = "https://lite-api.jup.ag";

/**
 * Swap using Jupiter Lite.
 * @param {object} p
 * @param {string} p.inputMint
 * @param {string} p.outputMint
 * @param {number} p.amountIn lamports
 * @param {number} [p.slippageBps=10]
 * @returns {Promise<string>} signature
 */
export async function jupSwap({ inputMint, outputMint, amountIn, slippageBps = 10 }) {
  // 1) Quote
  const q = new URL(`${JUP}/swap/v1/quote`);
  q.searchParams.set("inputMint", inputMint);
  q.searchParams.set("outputMint", outputMint);
  q.searchParams.set("amount", String(amountIn));
  q.searchParams.set("slippageBps", String(slippageBps));
  const quote = await fetchJson(q.toString());

  // 2) Swap transaction
  const user = getBotKeypair().publicKey.toBase58();
  const swap = await fetchJson(`${JUP}/swap/v1/swap`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ quoteResponse: quote, userPublicKey: user }),
  });

  // 3) Sign + send
  const kp = getBotKeypair();
  const tx = VersionedTransaction.deserialize(Buffer.from(swap.swapTransaction, "base64"));
  tx.sign([kp]);

  const conn = getConnection();
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 3 });
  return sig;
}

/* ---------- Sizing & conversions ---------- */
export function usdToLamports(usd, solUsd) {
  return Math.floor((usd / solUsd) * 1e9);
}

export function pickTradeSizeUsd(mode, customUsd, walletUsd) {
  // never exceed ~10% wallet cap
  const cap = walletUsd * 0.10;
  if (mode === "custom") return Math.max(0.01, Math.min(customUsd || 0, cap));

  const ranges = {
    safe:      [0.10, 1],
    medium:    [5, 50],
    aggressive:[100, 500],
  };
  const [mn, mx] = ranges[mode] || ranges.safe;
  const mxc = Math.min(mx, cap);
  if (mxc < mn) return mxc;
  return (mn + mxc) / 2;
}

/* ---------- Telegram quick chart (used by test-telegram) ---------- */
export async function sendTelegramPhoto({ chatId, title="Trade Update", subtitle="", valueText="" }) {
  const token = env("TELEGRAM_BOT_TOKEN");
  if (!token || !chatId) return { ok:false, message:"Missing TELEGRAM_BOT_TOKEN or chatId" };

  const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify({
    type:"bar", data:{labels:[title], datasets:[{data:[1]}]},
    options:{plugins:{title:{display:true,text:`${subtitle} ${valueText}`}}, scales:{y:{display:false}}}
  }))}`;

  const url = `https://api.telegram.org/bot${token}/sendPhoto`;
  const r = await fetch(url, {
    method:"POST",
    headers:{"content-type":"application/json"},
    body: JSON.stringify({ chat_id: chatId, photo: chartUrl, caption: `${title}\n${subtitle}\n${valueText}` })
  });
  return await r.json();
}
