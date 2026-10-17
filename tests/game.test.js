import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, advance, act, publicState } from '../public/shared/game.js';
test('taps spend energy and server budget blocks immediate repeat', () => {
  const p = createPlayer(0); act(p, { type: 'tap', count: 30 }, 0);
  assert.equal(p.coins, 30); assert.equal(p.energy, 470);
  assert.throws(() => act(p, { type: 'tap', count: 1 }, 0));
  act(p, { type: 'tap', count: 12 }, 1000); assert.equal(p.coins, 42);
  assert.throws(() => act(p, { type: 'tap', count: 31 }, 1000));
});
test('upgrades reject insufficient money and correctly improve power', () => {
  const p = createPlayer(0); assert.throws(() => act(p, { type: 'upgrade', id: 'tap' }, 0));
  act(p, { type: 'daily' }, 0); act(p, { type: 'upgrade', id: 'tap' }, 0);
  assert.equal(p.coins, 50); act(p, { type: 'tap', count: 1 }, 0); assert.equal(p.coins, 52);
  assert.throws(() => act(p, { type: 'upgrade', id: '__proto__' }, 0));
});
test('daily rewards cannot repeat and consecutive days increase streak', () => {
  const p = createPlayer(0); act(p, { type: 'daily' }, 0);
  assert.throws(() => act(p, { type: 'daily' }, 0));
  act(p, { type: 'daily' }, 86400000); assert.equal(p.coins, 300);
  act(p, { type: 'daily' }, 3 * 86400000); assert.equal(p.dailyStreak, 1);
});
test('offline income is bounded to one day and energy regenerates', () => {
  const p = createPlayer(0); p.levels.passive = 1; p.energy = 0;
  advance(p, 2 * 86400000); assert.equal(p.coins, 2880); assert.equal(p.energy, 500);
  advance(p, 0); assert.equal(p.coins, 2880);
});
test('quest reward is claimable once only after completion', () => {
  const p = createPlayer(0); assert.throws(() => act(p, { type: 'quest', id: 'tap100' }, 0));
  p.taps = 100; act(p, { type: 'quest', id: 'tap100' }, 0);
  assert.equal(p.coins, 100); assert.throws(() => act(p, { type: 'quest', id: 'tap100' }, 0));
  assert.equal(publicState(p).quests[0].claimed, true);
});
test('boosts have a daily limit and reset at UTC day boundary', () => {
  const p = createPlayer(0);
  for (let i = 0; i < 3; i++) { p.energy = 0; act(p, { type: 'boost' }, 0); }
  p.energy = 0; assert.throws(() => act(p, { type: 'boost' }, 0));
  advance(p, 86400000); assert.equal(publicState(p).boosts.remaining, 3);
});
