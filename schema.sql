-- Справочная схема: применяется автоматически внутри каждого Durable Object.
-- D1 не используется; выполнять этот файл вручную не требуется.
CREATE TABLE IF NOT EXISTS player (id INTEGER PRIMARY KEY CHECK(id = 1), data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, created INTEGER NOT NULL);
