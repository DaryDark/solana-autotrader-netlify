import { getTrades } from "./_shared/util.js";
function sumWithin(trades, ms){ const now = Date.now(); return trades.filter(t=>t.tsClose && (now-t.tsClose)<=ms).reduce((a,t)=>a+(t.pnlUsd||0),0); }
export async function handler(){
  const t = await getTrades(); const d1=86400000, d7=d1*7, d30=d1*30;
  return { statusCode:200, body: JSON.stringify({ count:t.length, pnl24h:sumWithin(t,d1), pnl7d:sumWithin(t,d7), pnl30d:sumWithin(t,d30), trades:t.slice(-50) }), headers:{"content-type":"application/json"} };
}
