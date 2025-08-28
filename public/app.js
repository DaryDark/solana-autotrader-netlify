async function loadSettings() {
  const r = await fetch('/.netlify/functions/settings');
  const s = await r.json();
  document.getElementById('mode').value = s.mode || 'safe';
  document.getElementById('customUsd').value = s.customUsd || 1;
  document.getElementById('theme').value = s.theme || 'dark';
  document.getElementById('telegramChatId').value = s.telegramChatId || '';
  document.body.dataset.theme = s.theme || 'dark';
}

async function saveSettings(extra = {}) {
  const payload = {
    run: undefined,
    mode: document.getElementById('mode').value,
    customUsd: Number(document.getElementById('customUsd').value),
    theme: document.getElementById('theme').value,
    telegramChatId: document.getElementById('telegramChatId').value || null,
    ...extra
  };
  const r = await fetch('/.netlify/functions/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const s = await r.json();
  document.body.dataset.theme = s.theme || 'dark';
}

async function loadStats() {
  const r = await fetch('/.netlify/functions/stats');
  const s = await r.json();
  const fmt = (n) => (n>=0?'+':'') + n.toFixed(2) + ' USD';
  document.getElementById('p24').textContent = fmt(s.pnl24h || 0);
  document.getElementById('p7').textContent = fmt(s.pnl7d || 0);
  document.getElementById('p30').textContent = fmt(s.pnl30d || 0);
  const ul = document.getElementById('trades');
  ul.innerHTML = '';
  (s.trades || []).slice().reverse().forEach(t => {
    const li = document.createElement('li');
    const date = new Date(t.tsClose || t.tsOpen).toLocaleString();
    li.textContent = `${date} • ${t.mint || ''} • ${ (t.pnlUsd>=0?'+':'') + (t.pnlUsd||0).toFixed(2)} USD`;
    ul.appendChild(li);
  });
}

document.getElementById('saveSettings').addEventListener('click', () => saveSettings());
document.getElementById('startBtn').addEventListener('click', () => saveSettings({ run: true }));
document.getElementById('stopBtn').addEventListener('click', () => saveSettings({ run: false }));
document.getElementById('saveTelegram').addEventListener('click', () => saveSettings());
document.getElementById('testTelegram').addEventListener('click', async () => {
  const chatId = document.getElementById('telegramChatId').value;
  await fetch('/.netlify/functions/test-telegram', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chatId }) });
  alert('Test photo requested.');
});

loadSettings().then(loadStats);
setInterval(loadStats, 10000);
