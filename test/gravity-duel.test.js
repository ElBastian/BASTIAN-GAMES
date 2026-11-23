'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { io: connectClient } = require('socket.io-client');
const { GravityDuel } = require('../server/gravity-duel');
const { createServer } = require('../server/index');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setup(opts = {}) {
  const events = [];
  const duel = new GravityDuel({ RECONNECT_GRACE_MS: 1000, ...opts }, (e, p, side) => events.push({ e, p, side }));
  return { duel, events };
}

function startRace(duel) {
  duel.join('player-aaaa', 's1');
  duel.join('player-bbbb', 's2');
  duel.ready('p1');
  duel.ready('p2');
  duel.tick(duel.cfg.COUNTDOWN_MS);
  assert.equal(duel.phase, 'PLAYING');
}

function runUntilOver(duel, maxMs = 60000) {
  for (let t = 0; t < maxMs && duel.phase === 'PLAYING'; t += 16) duel.tick(16);
  assert.equal(duel.phase, 'GAME_OVER');
}

test('dos jugadores entran por lados distintos y el tercero no', () => {
  const { duel } = setup();
  assert.equal(duel.join('player-aaaa', 's1').side, 'p1');
  assert.equal(duel.join('player-bbbb', 's2').side, 'p2');
  assert.equal(duel.canJoin('player-cccc'), false);
  assert.equal(duel.phase, 'READY');
});

test('la carrera usa sin máquina: nadie se mueve solo y empiezan parejos', () => {
  const { duel } = setup();
  startRace(duel);
  assert.equal(duel.game.player.homeX, duel.game.cpu.homeX);
  assert.equal(duel.game.player.track, 0);
  assert.equal(duel.game.cpu.track, 1);
  for (let i = 0; i < 30; i++) duel.tick(16);
  assert.equal(duel.game.cpu.track, 1);
  assert.equal(duel.game.cpu.want, null);
});

test('flip valida la pista y solo funciona durante la carrera', () => {
  const { duel } = setup();
  duel.join('player-aaaa', 's1');
  duel.join('player-bbbb', 's2');
  assert.equal(duel.flip('p1', 1), false);
  duel.ready('p1');
  duel.ready('p2');
  duel.tick(duel.cfg.COUNTDOWN_MS);
  assert.equal(duel.flip('p1', 2), false);
  assert.equal(duel.flip('p1', '1'), false);
  assert.equal(duel.flip('nadie', 1), false);
  assert.equal(duel.flip('p1', 1), true);
  duel.tick(16);
  assert.equal(duel.game.player.track, 1);
});

test('el primero que cae pierde, se suma la victoria y hay revancha con pista nueva', () => {
  const { duel } = setup({ rng: (() => { let n = 0.1; return () => (n += 0.2) % 1; })() });
  startRace(duel);
  const firstSeed = duel.seed;
  runUntilOver(duel);
  const { winner } = duel.outcome;
  if (winner) assert.equal(duel.wins[winner], 1);
  duel.rematch('p1');
  assert.equal(duel.phase, 'GAME_OVER');
  duel.rematch('p2');
  assert.equal(duel.phase, 'COUNTDOWN');
  assert.notEqual(duel.seed, firstSeed);
});

test('al desconectarse se pausa, y al volver hay una cuenta corta', () => {
  const { duel } = setup();
  startRace(duel);
  duel.tick(100);
  const scroll = duel.game.scroll;
  duel.leave('s1');
  duel.tick(500);
  assert.equal(duel.game.scroll, scroll);
  duel.join('player-aaaa', 's1b');
  assert.equal(duel.phase, 'COUNTDOWN');
  assert.equal(duel.game.scroll, scroll);
  duel.tick(2000);
  assert.equal(duel.phase, 'PLAYING');
});

test('si el rival no vuelve, quien queda gana por abandono', () => {
  const { duel, events } = setup();
  startRace(duel);
  duel.leave('s2');
  duel.tick(1001);
  assert.equal(duel.phase, 'WAITING');
  const notice = events.find((x) => x.e === 'abandon');
  assert.equal(notice.side, 'p1');
  assert.equal(duel.canJoin('player-cccc'), true);
});

test('en línea: no ocupa los lugares de Pong Dual y la carrera arranca', async () => {
  const server = createServer({ RECONNECT_GRACE_MS: 300, COUNTDOWN_MS: 100 });
  const port = await server.start(0);
  const open = (id) => new Promise((resolve, reject) => {
    const socket = connectClient(`http://127.0.0.1:${port}/gravity`, {
      auth: { playerId: id }, forceNew: true, reconnection: false, transports: ['websocket'],
    });
    socket.states = 0;
    socket.on('state', () => socket.states++);
    socket.on('joined', () => resolve(socket));
    socket.on('connect_error', reject);
  });
  const a = await open('player-aaaa');
  const b = await open('player-bbbb');
  try {
    assert.equal(server.gravity.duel.phase, 'READY');
    assert.equal(server.duel.slots.left, null);
    a.emit('ready');
    b.emit('ready');
    await sleep(350);
    assert.equal(server.gravity.duel.phase, 'PLAYING');
    assert.ok(a.states > 0 && b.states > 0);
    const before = server.gravity.duel.game.player.track;
    a.emit('flip', { track: 1 });
    await sleep(60);
    assert.equal(before, 0);
    assert.equal(server.gravity.duel.game.player.track, 1);
  } finally {
    a.close();
    b.close();
    await server.close();
  }
});
