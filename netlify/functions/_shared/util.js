// netlify/functions/_shared/util.js

import { getStore } from "@netlify/blobs";
import bs58 from "bs58";
import {
  Connection,
  Keypair,
  VersionedTransaction,
  PublicKey,
  SystemProgram,
  TransactionMessage,
} from "@solana/web3.js";

/** Blob keys */
export const SETTINGS_KEY = "settings.json";
export const POSITIONS_KEY = "positions.json";
export const TRADES_KEY = "trades.json";

/** Create a Netlify Blobs store (manual siteID + token to avoid env injection issues) */
export function store() {
  return getStore({
    name: "bot",
    siteID: process.env.NETLIFY_SITE_ID || "297754e5-d221-485e-a5e3-606ddc855f8f",
    token:
      process.env.NETLIFY_BLOBS_TOKEN ||
      "nfp_33KKYQgmcvXbA5UwgSfrwCynoh1MqXMA8cda",
  });
}

/** ✅ Connection for Solana */
export function getConnection() {
  const url =
    process.env.SOLANA_RPC_URL ||
    process.env.RPC_URL ||
    "https://api.mainnet-beta.solana.com"; // public, rate-limited
  const commitment = process.env.SOLANA_COMMITMENT || "processed";
  return new Connection(url, { commitment });
}

/** ✅ Return the bot wallet Keypair from env (supports base58 OR JSON array) */
export function getBotKeypair() {
  const raw =
    process.env.BOT_PRIVATE_KEY ||
    process.env.BOT_KEY ||
    process.env.PRIVATE_KEY;

  if (!raw) {
    throw new Error(
      "BOT_PRIVATE_KEY is not set in environment variables on Netlify."
    );
  }

  try {
    // JSON array format: [12,34,56,...]
    if (raw.trim().startsWith("[")) {
      const arr = JSON.parse(raw);
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    }

    // Base58 string format
    const secretKey = bs58.decode(raw);
    return Keypair.fromSecretKey(secretKey);
  } catch (e) {
    throw new Error(
      `Invalid BOT_PRIVATE_KEY format. Expected base58 string or JSON array. ${e.message}`
    );
  }
}

// ---------------------------------------------------------------------
// Settings / Positions / Trades (Blobs)
// ---------------------------------------------------------------------
export async function getSettings() {
  const s = await store().get(SETTINGS_KEY, { type: "json" });
  return s || {};
}
export async function setSettings(data) {
  await store().set(SETTINGS_KEY, JSON.stringify(data));
}

export async function getPositions() {
  const s = await store().get(POSITIONS_KEY, { type: "json" });
  return s || [];
}
export async function setPositions(data) {
  await store().set(POSITIONS_KEY, JSON.stringify(data));
}

export async function getTrades() {
  const s = await store().get(TRADES_KEY, { type: "json" });
  return s || [];
}
export async function setTrades(data) {
  await store().set(TRADES_KEY, JSON.stringify(data));
}

/** Convenience wrapper used by trader.js */
export async function addTrade(t) {
  const trades = await getTrades();
  trades.push({
    ...t,
    ts: t?.timestamp ?? Date.now(),
  });
  await setTrades(trades);
}

// ---------------------------------------------------------------------
// External helpers used by trader.js
// ---------------------------------------------------------------------

/**
 * ✅ SOL/USD price via Jupiter
 * Uses the public price endpoint (no token required).
 * Falls back to 0 if request fails.
 */
export async function getSolusd() {
  try {
    const url = "https://price.jup.ag/v6/price?ids=SOL";
    const res = await fetch(url, { timeout: 10_000 });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const price = data?.data?.SOL?.price;
    if (typeof price === "number" && price > 0) return price;
    return 0;
  } catch (e) {
    console.error("getSolusd error:", e);
    return 0;
  }
}

/**
 * 🔎 New pairs source.
 * If you have a Birdeye API key, you can replace this with a real fetch.
 * For now, return an empty list so the bot runs end-to-end without failing.
 */
export async function dexNewPairs() {
  // Example shape expected by trader.js:
  // return [{ mint: "So111...", symbol: "SOL" }, ...]
  return [];
}

/**
 * 🛡️ Rugcheck placeholder.
 * Return a simple object and pass it through passesSafetyChecks().
 */
export async function rugcheckToken(_mint) {
  // Replace with a real rugcheck API call if you like.
  return { score: 100 };
}

/** Basic predicate to approve a token as 'safe'. */
export function passesSafetyChecks(rugResult) {
  // Simple rule: score >= 70 considered safe
  return (rugResult?.score ?? 0) >= 70;
}

// ---------------------------------------------------------------------
// Optional: Send SOL helper (not required by all flows)
// ---------------------------------------------------------------------
export async function sendSol(connection, fromKeypair, toPubkey, lamports) {
  const ix = SystemProgram.transfer({
    fromPubkey: fromKeypair.publicKey,
    toPubkey: new PublicKey(toPubkey),
    lamports,
  });

  const blockhash = (await connection.getLatestBlockhash()).blockhash;

  const message = new TransactionMessage({
    payerKey: fromKeypair.publicKey,
    recentBlockhash: blockhash,
    instructions: [ix],
  }).compileToV0Message();

  const tx = new VersionedTransaction(message);
  tx.sign([fromKeypair]);

  const sig = await connection.sendTransaction(tx, { skipPreflight: true });
  await connection.confirmTransaction(sig, "processed");
  return sig;
}
