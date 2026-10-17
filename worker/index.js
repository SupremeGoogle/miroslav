import { DurableObject } from 'cloudflare:workers';
import { createPlayer, advance, act, publicState } from '../public/shared/game.js';

const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const encoder = new TextEncoder();
async function hmac(key, message) {
  const imported = await crypto.subtle.importKey('raw', typeof key === 'string' ? encoder.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', imported, encoder.encode(message));
}
export async function verifyInitData(raw, token, now = Date.now()) {
  if (!token || typeof raw !== 'string' || raw.length > 16384) throw new Error('Откройте игру через Telegram-бота.');
  const params = new URLSearchParams(raw);
  const hash = params.get('hash');
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) throw new Error('Недействительная подпись Telegram.');
  const seen = new Set();
  for (const [key] of params) { if (seen.has(key)) throw new Error('Некорректные данные Telegram.'); seen.add(key); }
  params.delete('hash');
  const check = [...params].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = await hmac('WebAppData', token);
  const signature = new Uint8Array(await hmac(secret, check));
  let mismatch = 0;
  for (let i = 0; i < 32; i++) mismatch |= signature[i] ^ parseInt(hash.slice(i * 2, i * 2 + 2), 16);
  const age = now / 1000 - Number(params.get('auth_date'));
  if (mismatch || !Number.isFinite(age) || age < -30 || age > 86400) throw new Error('Сессия истекла. Откройте игру заново через бота.');
  let user;
  try { user = JSON.parse(params.get('user')); } catch { throw new Error('Нет пользователя Telegram.'); }
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) throw new Error('Нет пользователя Telegram.');
  return user;
}

export class PlayerStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS player (id INTEGER PRIMARY KEY CHECK(id = 1), data TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, created INTEGER NOT NULL)');
  }
  process(action, requestId) {
    const now = Date.now();
    return this.ctx.storage.transactionSync(() => {
      const rows = this.sql.exec('SELECT data FROM player WHERE id = 1').toArray();
      const player = rows.length ? JSON.parse(rows[0].data) : createPlayer(now);
      advance(player, now);
      const duplicate = requestId && this.sql.exec('SELECT id FROM requests WHERE id = ?', requestId).toArray().length;
      if (action && !duplicate) {
        act(player, action, now);
        if (requestId) this.sql.exec('INSERT INTO requests (id, created) VALUES (?, ?)', requestId, now);
      }
      this.sql.exec('INSERT INTO player (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data', JSON.stringify(player));
      this.sql.exec('DELETE FROM requests WHERE created < ?', now - 86400000);
      return publicState(player);
    });
  }
}

async function webhook(request, env) {
  if (!env.BOT_WEBHOOK_SECRET || request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.BOT_WEBHOOK_SECRET) return json({ error: 'Forbidden' }, 403);
  const update = await request.json();
  const message = update.message;
  if (message?.chat?.type === 'private' && /^\/start(?:@\w+)?(?:\s|$)/.test(message.text || '')) {
    if (!env.APP_URL || !env.BOT_TOKEN) return json({ error: 'Bot is not configured' }, 503);
    const result = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: message.chat.id, text: '🚀 Мирослав ждёт тебя! Тапай, развивай мастерскую и открывай улучшения.', reply_markup: { inline_keyboard: [[{ text: '🎮 Играть', web_app: { url: env.APP_URL } }]] } })
    });
    if (!result.ok || !(await result.json()).ok) return json({ error: 'Telegram temporarily unavailable' }, 502);
  }
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    try {
      if (path === '/bot/webhook') return request.method === 'POST' ? await webhook(request, env) : json({ error: 'Method not allowed' }, 405);
      if (path.startsWith('/api/')) {
        if (!['/api/state', '/api/action'].includes(path)) return json({ error: 'Not found' }, 404);
        if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
        if (Number(request.headers.get('content-length') || 0) > 20000) return json({ error: 'Request too large' }, 413);
        const text = await request.text();
        if (text.length > 20000) return json({ error: 'Request too large' }, 413);
        let body;
        try { body = JSON.parse(text); } catch { return json({ error: 'Некорректный JSON.' }, 400); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Некорректный запрос.' }, 400);
        let user;
        try { user = await verifyInitData(request.headers.get('X-Telegram-Init-Data') || body.initData, env.BOT_TOKEN); }
        catch (error) { return json({ error: error.message }, 401); }
        if (path === '/api/action' && (!body.action || typeof body.action.type !== 'string')) return json({ error: 'Не указано действие.' }, 400);
        if (body.requestId !== undefined && (typeof body.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(body.requestId))) return json({ error: 'Некорректный номер запроса.' }, 400);
        const store = env.PLAYERS.getByName(String(user.id));
        try { return json({ state: await store.process(path === '/api/action' ? body.action : null, body.requestId) }); }
        catch { return json({ error: 'Действие недоступно. Обновите состояние и попробуйте снова.' }, 400); }
      }
      if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Method not allowed' }, 405);
      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      return new Response(response.body, { status: response.status, headers });
    } catch { return json({ error: 'Сервис временно недоступен. Попробуйте ещё раз.' }, 503); }
  }
};
