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

// ✅ Fixed store function
export function store() {
  const siteID = process.env.NETLIFY_SITE_ID;       // add in Netlify env vars
  const token = process.env.NETLIFY_BLOBS_TOKEN;    // add in Netlify env vars

  if (!siteID || !token) {
    throw new Error(
      "❌ Netlify Blobs not configured. Please set NETLIFY_SITE_ID and NETLIFY_BLOBS_TOKEN in Environment variables."
    );
  }

  return getStore({ name: "bot", siteID, token });
}

// -------------------------------
// Helpers for settings / positions
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
  return s || {};
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
