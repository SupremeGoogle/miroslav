# Мирослав · Telegram Mini App

Тапалка с мультяшным героем по фотографии. Интерфейс и API работают на одном Cloudflare Worker; прогресс каждого Telegram-пользователя хранится отдельно в SQLite Durable Object. D1 и внешний сервер не нужны. Монеты игровые, без денежной стоимости.

## Локальный запуск

Нужен Node.js 22 или новее.

```powershell
npm install
npm run dev
```

Откройте адрес, который покажет Wrangler. В обычном браузере работает деморежим с локальным сохранением. Telegram-прогресс хранится на сервере и доступен только с действительной подписью Telegram. Для локальной проверки Telegram API скопируйте `.dev.vars.example` в `.dev.vars` и заполните значения. Этот файл исключён из Git.

## Публикация на Cloudflare Workers

1. Войдите в свой аккаунт и разверните приложение:

```powershell
npx wrangler login
npm run deploy
```

2. Полученный HTTPS-адрес впишите в `vars.APP_URL` файла `wrangler.jsonc`, заменив пример. Загрузите секреты интерактивно — они не должны попадать в исходники:

```powershell
npx wrangler secret put BOT_TOKEN
npx wrangler secret put BOT_WEBHOOK_SECRET
npm run deploy
```

`BOT_WEBHOOK_SECRET` придумайте случайным: 32–256 символов из латинских букв, цифр, `_` и `-`. Один и тот же секрет нужен Worker и скрипту настройки бота. Токен, опубликованный в переписке, рекомендуется перевыпустить через `/revoke` у @BotFather; используйте новый токен при настройке.

3. В локальном окружении задайте `BOT_TOKEN`, `BOT_WEBHOOK_SECRET`, `APP_URL` и запустите:

```powershell
node scripts/setup-bot.mjs
```

Скрипт подключает webhook, команду `/start` и кнопку меню. Значения удобно загрузить из уже заполненного `.dev.vars` средствами Node.js:

```powershell
node --env-file=.dev.vars scripts/setup-bot.mjs
```

В `.dev.vars` должен быть публичный адрес из шага 2, а не localhost. Скрипт намеренно заменяет webhook указанного бота: если бот уже обслуживает другой проект, сначала используйте отдельного бота.

4. Отправьте `/start` боту в личном чате и нажмите «Играть». При желании задайте основное Mini App и оформление в @BotFather. После публикации проверьте тап, покупку улучшения и сохранение прогресса при закрытии и повторном открытии Telegram.

## Как устроено сохранение

- `POST /api/state`: тело `{ "initData": "..." }`.
- `POST /api/action`: тело `{ "initData": "...", "requestId": "уникальный-id", "action": { "type": "..." } }`.
- Вместо `initData` в теле можно передать заголовок `X-Telegram-Init-Data`.
- Успех: `{ "state": ... }`; ошибка: `{ "error": "..." }` с HTTP-статусом.
- Сервер проверяет HMAC подпись, ID пользователя и возраст сессии (24 часа), рассчитывает изменения по своему времени. Изменённые клиентом монеты не принимаются.
- Действия одного игрока выполняются в синхронной транзакции SQLite. Повторный `requestId` не применяет действие второй раз в течение 24 часов.
- Серверное время и энергия ограничивают темп игры; это базовая защита, не полноценная система обнаружения ботов.
- `schema.sql` — справочная схема. Создание таблиц и миграция Durable Objects автоматические. Не удаляйте миграцию `v1` после публикации.

## Файлы

`public/` — игра и графика, `public/shared/game.js` — общие правила, `worker/index.js` — авторизация, API и Telegram webhook, `wrangler.jsonc` — Cloudflare, `scripts/setup-bot.mjs` — подключение бота.

Для очистки демопрогресса очистите данные сайта в браузере. Серверный прогресс и демопрогресс независимы. При очистке браузерных данных Telegram-прогресс остаётся в Cloudflare.

Мультяшный персонаж: `public/assets/miro.png`, создан встроенным imagegen по предоставленному фото. Промпт: дружелюбный мультяшный 3D-герой со светлыми волосами, голубыми глазами, синей футболкой, джинсами и жестом «палец вверх», отдельный игровой персонаж на прозрачном фоне.

Документация: [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/), [SQLite Durable Objects](https://developers.cloudflare.com/durable-objects/get-started/), [проверка данных Telegram](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app), [Bot API](https://core.telegram.org/bots/api).
