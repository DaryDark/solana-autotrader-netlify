import { Keypair } from "@solana/web3.js"; import bs58 from "bs58";
const kp = Keypair.generate();
console.log("Public Key:", kp.publicKey.toBase58());
console.log("BOT_PRIVATE_KEY (JSON array):");
console.log(JSON.stringify(Array.from(kp.secretKey)));
console.log("BOT_PRIVATE_KEY (base58 alternative):");
console.log(bs58.encode(kp.secretKey));
