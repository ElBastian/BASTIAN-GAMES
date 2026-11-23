'use strict';

const crypto = require('crypto');
const { GravityDuel } = require('./gravity-duel');

const ROOM = 'gravity';
const PLAYER_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

function attachGravity(io, cfg) {
  const nsp = io.of('/gravity');

  const duel = new GravityDuel(cfg, (event, payload, side) => {
    if (event === 'kick') {
      const s = nsp.sockets.get(payload.socketId);
      if (s) {
        s.emit('kicked', { reason: payload.reason });
        s.disconnect(true);
      }
      return;
    }
    if (side) {
      const slot = duel.slots[side];
      if (slot && slot.connected) nsp.to(slot.socketId).emit(event, payload);
    } else {
      nsp.to(ROOM).emit(event, payload);
    }
  });

  nsp.use((socket, next) => {
    const raw = socket.handshake.auth && socket.handshake.auth.playerId;
    const playerId = typeof raw === 'string' && PLAYER_ID_RE.test(raw) ? raw : crypto.randomUUID();
    if (!duel.canJoin(playerId)) {
      const err = new Error('duel_full');
      err.data = { message: 'Duelo lleno' };
      return next(err);
    }
    socket.data.playerId = playerId;
    next();
  });

  nsp.on('connection', (socket) => {
    const res = duel.join(socket.data.playerId, socket.id);
    if (!res.ok) {
      socket.disconnect(true);
      return;
    }
    if (res.replacedSocketId) {
      const old = nsp.sockets.get(res.replacedSocketId);
      if (old) old.disconnect(true);
    }
    socket.join(ROOM);
    socket.emit('joined', { side: res.side, playerId: socket.data.playerId });
    socket.emit('phase', duel.phasePayload());

    let windowStart = Date.now();
    let count = 0;
    socket.on('flip', (msg) => {
      const now = Date.now();
      if (now - windowStart >= 1000) {
        windowStart = now;
        count = 0;
      }
      if (++count > cfg.INPUT_MAX_PER_SEC) return;
      const side = duel.sideOf(socket.id);
      if (!side || !msg || typeof msg !== 'object') return;
      duel.flip(side, msg.track);
    });
    socket.on('ready', () => {
      const side = duel.sideOf(socket.id);
      if (side) duel.ready(side);
    });
    socket.on('rematch', () => {
      const side = duel.sideOf(socket.id);
      if (side) duel.rematch(side);
    });
    socket.on('latency', (ack) => {
      if (typeof ack === 'function') ack();
    });
    socket.on('disconnect', () => duel.leave(socket.id));
  });

  function tick(dtMs) {
    duel.tick(dtMs);
    if (duel.phase === 'COUNTDOWN' || duel.phase === 'PLAYING') {
      const snap = duel.snapshot();
      if (snap) nsp.to(ROOM).emit('state', snap);
    }
  }

  return { duel, tick };
}

module.exports = { attachGravity };
