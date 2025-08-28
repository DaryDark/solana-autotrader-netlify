# Solana Meme-Coin Autotrader (Netlify) — Lite API Edition

- Uses **Jupiter Lite API** (`https://lite-api.jup.ag`) → no key needed.
- Scheduled trader runs **every 1 minute**.
- Safety checks: **RugCheck**, Dexscreener scoring.
- Modes: safe / medium / aggressive / custom (USD sizing, capped at ~10% wallet).
- Stores state in **Netlify Blobs**.
- Dashboard at `/` + Telegram test-photo function.

## Netlify Environment Variables
- `PHANTOM_PNL_ADDRESS` — your receive wallet (profits sweep here)
- `BOT_PRIVATE_KEY` — JSON array of 64 numbers (generate locally or via keygen.html method we used)
- `BIRDEYE_API_KEY` — your key

Optional:
- `SOLANA_RPC_URL`
- `TELEGRAM_BOT_TOKEN` (for Telegram photos)

## Deploy via GitHub
- Put these files in a GitHub repo (root must contain `netlify.toml`, `public/`, `netlify/`).
- In Netlify → Import from Git → Publish dir = `public` → Deploy.
