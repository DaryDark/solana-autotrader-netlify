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

// Use one blob store for the bot
export function store() {
  return getStore({ name: "bot" });
}

// Load settings from blobs
export async function getSettings() {
  const s = await store().get(SETTINGS_KEY, { type: "json" });
  return s ?? {};
}

// Save settings to blobs
export async function saveSettings(settings) {
  await store().set(SETTINGS_KEY, JSON.stringify(settings));
}

// Load positions from blobs
export async function getPositions() {
  const p = await store().get(POSITIONS_KEY, { type: "json" });
  return p ?? [];
}

// Save positions
export async function savePositions(positions) {
  await store().set(POSITIONS_KEY, JSON.stringify(positions));
}

// Load trades
export async function getTrades() {
  const t = await store().get(TRADES_KEY, { type: "json" });
  return t ?? [];
}

// Save trades
export async function saveTrades(trades) {
  await store().set(TRADES_KEY, JSON.stringify(trades));
}

// Decode private key from environment
export function loadKeypair() {
  if (!process.env.BOT_PRIVATE_KEY) throw new Error("BOT_PRIVATE_KEY missing");
  const arr = JSON.parse(process.env.BOT_PRIVATE_KEY);
  return Keypair.fromSecretKey(new Uint8Array(arr));
}

// Simple helper: connect to Solana RPC
export function getConnection() {
  const endpoint =
    process.env.SOLANA_RPC ?? "https://api.mainnet-beta.solana.com";
  return new Connection(endpoint, "confirmed");
}

// Send SOL between wallets
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
