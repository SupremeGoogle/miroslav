// Uses environment variables only; never prints token-bearing URLs.
const { BOT_TOKEN, BOT_WEBHOOK_SECRET, APP_URL } = process.env;
if (!BOT_TOKEN || !BOT_WEBHOOK_SECRET || !APP_URL?.startsWith('https://')) {
  console.error('Задайте BOT_TOKEN, BOT_WEBHOOK_SECRET и APP_URL (https) в окружении.');
  process.exit(1);
}
if (!/^[A-Za-z0-9_-]{32,256}$/.test(BOT_WEBHOOK_SECRET)) {
  console.error('BOT_WEBHOOK_SECRET: 32–256 символов A-Z, a-z, 0-9, _ или -.');
  process.exit(1);
}
async function telegram(method, body) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error('failed');
    console.log(`${method}: готово`);
  } catch {
    console.error(`${method}: ошибка. Проверьте токен, URL и доступ к Telegram API.`);
    process.exit(1);
  }
}
const url = new URL(APP_URL);
await telegram('setWebhook', { url: `${url.origin}/bot/webhook`, secret_token: BOT_WEBHOOK_SECRET, allowed_updates: ['message'] });
await telegram('setChatMenuButton', { menu_button: { type: 'web_app', text: '🎮 Играть', web_app: { url: APP_URL } } });
await telegram('setMyCommands', { commands: [{ command: 'start', description: 'Открыть игру' }] });
