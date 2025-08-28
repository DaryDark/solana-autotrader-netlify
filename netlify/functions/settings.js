import { getSettings, setSettings } from "./_shared/util.js";
export async function handler(event) {
  if (event.httpMethod === "GET") {
    const s = await getSettings();
    return { statusCode: 200, body: JSON.stringify(s), headers: { "content-type": "application/json" } };
  }
  if (event.httpMethod === "POST") {
    const body = JSON.parse(event.body || "{}");
    const patch = {}; for (const k of ["run","mode","customUsd","theme","telegramChatId"]) if (k in body) patch[k]=body[k];
    const next = await setSettings(patch);
    return { statusCode: 200, body: JSON.stringify(next), headers: { "content-type": "application/json" } };
  }
  return { statusCode: 405, body: "Method Not Allowed" };
}
