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

/** ✅ NEW: Provide a Connection for trader.js */
export function getConnection() {
  const url =
    process.env.SOLANA_RPC_URL ||
    process.env.RPC_URL ||
    "https://api.mainnet-beta.solana.com"; // public endpoint (rate-limited)
  const commitment = process.env.SOLANA_COMMITMENT || "processed";
  return new Connection(url, { commitment });
}

// -------------------------------
// Settings / Positions / Trades
// -------------------------------
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

// -------------------------------
// Solana keypair helpers
// -------------------------------
export function loadKeypair(secret) {
  const secretKey = bs58.decode(secret);
  return Keypair.fromSecretKey(secretKey);
}

// -------------------------------
// Send SOL
// -------------------------------
export async function sendSol(connection, fromKeypair, toPubkey, lamports) {
  const ix = SystemProgram.transfer({
    fromPubkey: fromKeypair.publicKey,
    toPubkey,
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
