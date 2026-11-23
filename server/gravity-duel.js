'use strict';

const { getConfig } = require('./config');
const Core = require('../public/games/sprite/gravity-core');

const SIDES = ['p1', 'p2'];
const opposite = (s) => (s === 'p1' ? 'p2' : 'p1');
const IN_PROGRESS = new Set(['COUNTDOWN', 'PLAYING']);
const TICK_MS = 1000 / 120;
const RESUME_COUNTDOWN_MS = 2000;

const round = (n) => Math.round(n * 10) / 10;

class GravityDuel {
  constructor(opts = {}, emit = () => {}) {
    this.cfg = { ...getConfig(), ...opts };
    this.emit = emit;
    this.rng = opts.rng || Math.random;
    this.slots = { p1: null, p2: null };
    this.phase = 'WAITING';
    this.phaseMs = 0;
    this.countdownMs = this.cfg.COUNTDOWN_MS;
    this.game = null;
    this.seed = null;
    this.acc = 0;
    this.outcome = null;
    this.wins = { p1: 0, p2: 0 };
  }

  _findByPlayer(playerId) {
    if (this.cfg.ALLOW_SAME_BROWSER) return null;
    return SIDES.find((s) => this.slots[s] && this.slots[s].playerId === playerId) || null;
  }

  canJoin(playerId) {
    return !!this._findByPlayer(playerId) || SIDES.some((s) => !this.slots[s]);
  }

  join(playerId, socketId) {
    const existing = this._findByPlayer(playerId);
    if (existing) {
      const slot = this.slots[existing];
      const wasAway = !slot.connected;
      const replacedSocketId = slot.connected && slot.socketId !== socketId ? slot.socketId : null;
      slot.socketId = socketId;
      slot.connected = true;
      slot.graceLeft = 0;
      this.emit('opponent_back', {}, opposite(existing));
      if (wasAway && this.phase === 'PLAYING' && !this._anyAway()) this._setPhase('COUNTDOWN', RESUME_COUNTDOWN_MS);
      else this._maybeStart();
      return { ok: true, side: existing, reconnected: true, replacedSocketId };
    }

    const side = SIDES.find((s) => !this.slots[s]);
    if (!side) return { ok: false, reason: 'duel_full' };

    this.slots[side] = { playerId, socketId, connected: true, ready: false, rematch: false, graceLeft: 0, idleMs: 0 };
    if (SIDES.every((s) => this.slots[s]) && this.phase === 'WAITING') this._setPhase('READY');
    else this.emit('phase', this.phasePayload());
    return { ok: true, side, reconnected: false, replacedSocketId: null };
  }

  sideOf(socketId) {
    return SIDES.find((s) => this.slots[s] && this.slots[s].connected && this.slots[s].socketId === socketId) || null;
  }

  leave(socketId) {
    const side = this.sideOf(socketId);
    if (!side) return;
    const slot = this.slots[side];
    slot.connected = false;
    slot.graceLeft = this.cfg.RECONNECT_GRACE_MS;
    this.emit('opponent_left', { graceMs: this.cfg.RECONNECT_GRACE_MS }, opposite(side));
  }

  flip(side, track) {
    if (!SIDES.includes(side) || !this.slots[side]) return false;
    if (track !== Core.FLOOR && track !== Core.CEILING) return false;
    if (this.phase !== 'PLAYING' || this._anyAway()) return false;
    Core.press(this.game, this._runner(side), track);
    return true;
  }

  ready(side) {
    if (this.phase !== 'READY' || !this.slots[side]) return false;
    this.slots[side].ready = true;
    this.emit('phase', this.phasePayload());
    this._maybeStart();
    return true;
  }

  rematch(side) {
    if (this.phase !== 'GAME_OVER' || !this.slots[side]) return false;
    this.slots[side].rematch = true;
    this.emit('phase', this.phasePayload());
    if (SIDES.every((s) => this.slots[s] && this.slots[s].connected && this.slots[s].rematch)) this._startRace();
    return true;
  }

  _anyAway() {
    return SIDES.some((s) => this.slots[s] && !this.slots[s].connected);
  }

  tick(dtMs) {
    for (const s of SIDES) {
      const slot = this.slots[s];
      if (slot && !slot.connected) {
        slot.graceLeft -= dtMs;
        if (slot.graceLeft <= 0) this._release(s);
      }
    }
    if (IN_PROGRESS.has(this.phase) && this._anyAway()) return;

    this.phaseMs += dtMs;
    if (this.phase === 'READY') {
      for (const s of SIDES) {
        const slot = this.slots[s];
        if (slot && slot.connected && !slot.ready) {
          slot.idleMs += dtMs;
          if (slot.idleMs >= this.cfg.IDLE_KICK_MS) {
            this.emit('kick', { socketId: slot.socketId, reason: 'idle' });
            this._release(s);
            break;
          }
        }
      }
    } else if (this.phase === 'COUNTDOWN') {
      if (this.phaseMs >= this.countdownMs) this._setPhase('PLAYING');
    } else if (this.phase === 'PLAYING') {
      this.acc += dtMs;
      while (this.acc >= TICK_MS && !this.game.finished) {
        Core.step(this.game, TICK_MS / 1000);
        this.acc -= TICK_MS;
      }
      if (this.game.finished) this._finishRace();
    }
  }

  _runner(side) {
    return side === 'p1' ? this.game.player : this.game.cpu;
  }

  _startRace() {
    this.seed = Math.floor(this.rng() * 0xffffffff) >>> 0;
    this.game = Core.createGame(this.seed, { versus: true });
    this.acc = 0;
    this.outcome = null;
    this._resetFlags();
    this._setPhase('COUNTDOWN', this.cfg.COUNTDOWN_MS);
  }

  _finishRace() {
    const { result } = this.game;
    const winner = result === 'player' ? 'p1' : result === 'cpu' ? 'p2' : null;
    if (winner) this.wins[winner] += 1;
    const loser = winner ? this._runner(opposite(winner)) : this.game.player;
    this.outcome = { winner, cause: loser.cause, meters: Math.floor(this.game.scroll / 10) };
    this._resetFlags();
    this._setPhase('GAME_OVER');
  }

  _maybeStart() {
    if (this.phase !== 'READY') return;
    if (SIDES.every((s) => this.slots[s] && this.slots[s].connected && this.slots[s].ready)) this._startRace();
  }

  _resetFlags() {
    for (const s of SIDES) {
      if (this.slots[s]) {
        this.slots[s].ready = false;
        this.slots[s].rematch = false;
        this.slots[s].idleMs = 0;
      }
    }
  }

  _release(side) {
    const other = opposite(side);
    const wasInProgress = IN_PROGRESS.has(this.phase);
    this.slots[side] = null;
    if (wasInProgress && this.slots[other]) this.emit('abandon', { winner: other }, other);
    this.game = null;
    this.seed = null;
    this.outcome = null;
    this.wins = { p1: 0, p2: 0 };
    this._resetFlags();
    this._setPhase('WAITING');
  }

  _setPhase(phase, countdownMs) {
    this.phase = phase;
    this.phaseMs = 0;
    if (countdownMs !== undefined) this.countdownMs = countdownMs;
    this.emit('phase', this.phasePayload());
  }

  phasePayload() {
    const occupied = {};
    const connected = {};
    const ready = {};
    const rematch = {};
    for (const s of SIDES) {
      const slot = this.slots[s];
      occupied[s] = !!slot;
      connected[s] = !!(slot && slot.connected);
      ready[s] = !!(slot && slot.ready);
      rematch[s] = !!(slot && slot.rematch);
    }
    return {
      phase: this.phase,
      occupied,
      connected,
      ready,
      rematch,
      seed: this.seed,
      wins: { ...this.wins },
      outcome: this.outcome,
      endsInMs: this.phase === 'COUNTDOWN' ? Math.max(0, this.countdownMs - this.phaseMs) : 0,
    };
  }

  snapshot() {
    if (!this.game) return null;
    const runner = (r) => ({
      x: round(r.x),
      y: round(r.y),
      vy: round(r.vy),
      track: r.track,
      grounded: r.grounded,
      falling: r.falling,
      gone: r.gone,
      landed: r.landed,
    });
    return {
      seed: this.seed,
      scroll: round(this.game.scroll),
      speed: round(this.game.speed),
      p1: runner(this.game.player),
      p2: runner(this.game.cpu),
    };
  }
}

module.exports = { GravityDuel, SIDES };
