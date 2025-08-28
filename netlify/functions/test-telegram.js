import { getSettings, sendTelegramPhoto } from "./_shared/util.js";
export async function handler(event){
  const s = await getSettings();
  const b = event.httpMethod==="POST" ? JSON.parse(event.body||"{}") : {};
  const chatId = b.chatId || s.telegramChatId;
  const r = await sendTelegramPhoto({ chatId, title:"Test Photo", subtitle:"Telegram integration is", valueText:"✅ READY" });
  return { statusCode:200, body: JSON.stringify(r), headers:{"content-type":"application/json"} };
}
