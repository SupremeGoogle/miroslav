const DAY = 86400000;
const DEFINITIONS = {
  tap: { title: 'Сила тапа', base: 50, factor: 1.65 },
  energy: { title: 'Запас энергии', base: 80, factor: 1.6 },
  regen: { title: 'Восстановление', base: 120, factor: 1.7 },
  passive: { title: 'Автоферма', base: 150, factor: 1.65 },
};
const QUESTS = [
  { id: 'tap100', title: 'Сделай 100 тапов', field: 'taps', target: 100, reward: 100 },
  { id: 'earn1000', title: 'Заработай 1 000 монет', field: 'totalEarned', target: 1000, reward: 200 },
  { id: 'buy3', title: 'Купи 3 улучшения', field: 'purchases', target: 3, reward: 150 },
];
const day = now => Math.floor(now / DAY);
const stats = p => ({ maxEnergy: 500 + p.levels.energy * 250, tapPower: 1 + p.levels.tap, regenPerSecond: 1 + p.levels.regen, passivePerHour: p.levels.passive * 120 });
const cost = (p, id) => Math.ceil(DEFINITIONS[id].base * DEFINITIONS[id].factor ** p.levels[id]);
function fail(code, message) { const error = new Error(message); error.status = 400; error.code = code; throw error; }
function earn(p, amount) { p.coins += amount; p.totalEarned += amount; }

export function createPlayer(now = Date.now()) {
  return { coins: 0, totalEarned: 0, taps: 0, energy: 500, levels: { tap: 0, energy: 0, regen: 0, passive: 0 }, purchases: 0, createdAt: now, updatedAt: now, tapAt: now, tapBudget: 30, dailyDay: null, dailyStreak: 0, boostDay: day(now), boostsUsed: 0, claimedQuests: [] };
}

export function advance(p, now = Date.now()) {
  now = Math.max(p.updatedAt, now);
  const elapsed = Math.min(now - p.updatedAt, DAY) / 1000;
  const s = stats(p);
  p.energy = Math.min(s.maxEnergy, p.energy + elapsed * s.regenPerSecond);
  earn(p, elapsed * s.passivePerHour / 3600);
  p.updatedAt = now;
  p.tapBudget = Math.min(30, p.tapBudget + Math.max(0, now - p.tapAt) / 1000 * 12);
  p.tapAt = now;
  if (p.boostDay !== day(now)) { p.boostDay = day(now); p.boostsUsed = 0; }
  return p;
}

export function act(p, action, now = Date.now()) {
  if (!action || typeof action !== 'object') fail('INVALID_ACTION', 'Некорректное действие');
  advance(p, now);
  const s = stats(p);
  switch (action.type) {
    case 'tap': {
      if (!Number.isInteger(action.count) || action.count < 1 || action.count > 30) fail('INVALID_COUNT', 'За один раз можно сделать от 1 до 30 тапов');
      const accepted = Math.min(action.count, Math.floor(p.tapBudget), Math.floor(p.energy / s.tapPower));
      if (!accepted) fail('NO_ENERGY_OR_RATE', 'Подожди восстановления энергии или следующего тапа');
      p.tapBudget -= accepted; p.energy -= accepted * s.tapPower; p.taps += accepted; earn(p, accepted * s.tapPower);
      break;
    }
    case 'upgrade': {
      if (!Object.hasOwn(DEFINITIONS, action.id)) fail('INVALID_UPGRADE', 'Улучшение не найдено');
      if (p.levels[action.id] >= 50) fail('MAX_LEVEL', 'Достигнут максимальный уровень');
      const price = cost(p, action.id);
      if (p.coins < price) fail('INSUFFICIENT_COINS', 'Не хватает монет');
      p.coins -= price; p.levels[action.id]++; p.purchases++;
      if (action.id === 'energy') p.energy = Math.min(stats(p).maxEnergy, p.energy + 250);
      break;
    }
    case 'daily': {
      const today = day(p.updatedAt);
      if (p.dailyDay === today) fail('ALREADY_CLAIMED', 'Сегодняшняя награда уже получена');
      p.dailyStreak = p.dailyDay === today - 1 ? p.dailyStreak % 7 + 1 : 1;
      p.dailyDay = today; earn(p, 100 * p.dailyStreak);
      break;
    }
    case 'quest': {
      const q = QUESTS.find(q => q.id === action.id);
      if (!q) fail('INVALID_QUEST', 'Задание не найдено');
      if (p.claimedQuests.includes(q.id)) fail('ALREADY_CLAIMED', 'Награда уже получена');
      if (p[q.field] < q.target) fail('QUEST_INCOMPLETE', 'Задание ещё не выполнено');
      p.claimedQuests.push(q.id); earn(p, q.reward); break;
    }
    case 'boost':
      if (p.boostsUsed >= 3) fail('NO_BOOSTS', 'Бусты на сегодня закончились');
      if (p.energy >= s.maxEnergy) fail('ENERGY_FULL', 'Энергия уже полная');
      p.boostsUsed++; p.energy = s.maxEnergy; break;
    default: fail('INVALID_ACTION', 'Неизвестное действие');
  }
  return publicState(p);
}

export function publicState(p) {
  const s = stats(p), today = day(p.updatedAt);
  const value = (id, level) => id === 'tap' ? level + 1 : id === 'energy' ? 500 + level * 250 : id === 'regen' ? level + 1 : level * 120;
  return { coins: Math.floor(p.coins), totalEarned: Math.floor(p.totalEarned), taps: p.taps, energy: Math.floor(p.energy), ...s,
    level: Math.floor(Math.sqrt(p.totalEarned / 100)) + 1, levels: { ...p.levels }, purchases: p.purchases,
    daily: { available: p.dailyDay !== today, streak: p.dailyStreak, nextAt: (today + 1) * DAY, reward: 100 * (p.dailyDay === today - 1 ? p.dailyStreak % 7 + 1 : p.dailyDay === today ? p.dailyStreak : 1) },
    quests: QUESTS.map(q => ({ id: q.id, title: q.title, progress: Math.min(q.target, Math.floor(p[q.field])), target: q.target, reward: q.reward, claimed: p.claimedQuests.includes(q.id) })),
    boosts: { remaining: 3 - p.boostsUsed, nextAt: (today + 1) * DAY },
    upgrades: Object.entries(DEFINITIONS).map(([id, def]) => ({ id, title: def.title, level: p.levels[id], cost: cost(p, id), value: value(id, p.levels[id]), nextValue: value(id, p.levels[id] + 1), maxed: p.levels[id] >= 50 })),
  };
}
