'use strict';
// Hit's Up · servidor del juego (Node 18+, sin dependencias)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = process.env.PORT || 3000;
const MOCK = process.env.DEEZER_MOCK === '1';
const PUBLIC_DIR = path.join(__dirname, 'public');

const T = {
  PREVIEW: 30000,      // duración del fragmento
  ANSWER: 5000,        // tiempo para responder en la ronda 1
  BONUS: 10000,        // +1 si se acierta antes de este tiempo de música
  REVEAL: 6000,        // revelación en la TV
  TURN: { 2: 45000, 3: 45000, 4: 60000 },
  TURN_END: 4500,
  FALTA: 30000,        // tiempo máximo del debate
  HIT_WINDOW: 4000,    // una falta pulsada justo tras un acierto apunta a esa carta
  DECK_TOTAL: 30,
  FICHAS: 2,
  CARRY_MIN: 3000
};
if (process.env.HU_FAST === '1') Object.assign(T, { PREVIEW: 9000, BONUS: 4000, REVEAL: 2500, TURN: { 2: 15000, 3: 15000, 4: 15000 }, TURN_END: 2000, DECK_TOTAL: 6 });
const ROUND_PTS = { 2: 2, 3: 3, 4: 4 };
const PRESETS = [
  { name: 'Tigres', color: '#FFB547' },
  { name: 'Ardillas', color: '#3ED8C3' },
  { name: 'Leones', color: '#8B7CFF' },
  { name: 'Delfines', color: '#5AA9FF' },
  { name: 'Lobos', color: '#FF8A5B' }
];

const rooms = new Map();

function lanUrls() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${PORT}`);
  }
  // Primero las redes domésticas habituales
  return out.sort((a, b) => (/\/\/192\.168\./.test(b) - /\/\/192\.168\./.test(a)));
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */
const now = () => Date.now();
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function newCode() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do { c = Array.from({ length: 4 }, () => L[Math.floor(Math.random() * L.length)]).join(''); } while (rooms.has(c));
  return c;
}
class GameError extends Error {}
const fail = msg => { throw new GameError(msg); };

/* ------------------------------------------------------------------ */
/* Deezer                                                              */
/* ------------------------------------------------------------------ */
const NOISE = /karaok|cover|tribute|homenaje|in the style of|made famous|originally performed|lullaby|8.?bit|piano version|versi[oó]n instrumental|remake|backing track/i;
const isNoise = t => NOISE.test(t.title || '') || NOISE.test((t.artist && t.artist.name) || '') || NOISE.test((t.album && t.album.title) || '');

async function dz(p) {
  for (let i = 0; i < 3; i++) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch('https://api.deezer.com' + p, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HitsUp/0.1)', 'Accept': 'application/json' } });
      const text = await r.text();
      let d;
      try { d = JSON.parse(text); } catch (e) { throw new Error(`Deezer HTTP ${r.status}: ${text.slice(0, 160)}`); }
      if (d && d.error) {
        if (d.error.code === 4) { await new Promise(r => setTimeout(r, 1200)); continue; }
        throw new Error(d.error.message || 'Deezer error');
      }
      return d;
    } finally { clearTimeout(to); }
  }
  throw new Error('Deezer: límite de peticiones');
}
const mapTrack = t => ({
  id: String(t.id), title: t.title_short || t.title, artist: t.artist ? t.artist.name : '',
  album: t.album ? t.album.title : '', cover: t.album ? (t.album.cover_medium || t.album.cover) : '', preview: t.preview
});

const MOCK_SONGS = [
  ['Despacito', 'Luis Fonsi'], ['Macarena', 'Los del Río'], ['Aserejé', 'Las Ketchup'], ['Waka Waka', 'Shakira'],
  ['Danza Kuduro', 'Don Omar'], ['Bailando', 'Enrique Iglesias'], ['La Flaca', 'Jarabe de Palo'], ['Y.M.C.A.', 'Village People'],
  ['Dancing Queen', 'ABBA'], ['Bohemian Rhapsody', 'Queen'], ['Billie Jean', 'Michael Jackson'], ['Uptown Funk', 'Mark Ronson'],
  ['Mr. Brightside', 'The Killers'], ['Bad Romance', 'Lady Gaga'], ['Tusa', 'Karol G'], ['Quédate', 'Quevedo'],
  ['Corazón partío', 'Alejandro Sanz'], ['Mi gran noche', 'Raphael'], ['Ay qué dolor', 'Los Chunguitos'], ['Hey Ya!', 'OutKast']
].map(([title, artist], i) => ({ id: String(1000 + i), title, artist, album: 'Demo', cover: '', preview: 'https://example.invalid/' + (1000 + i) + '.mp3' }));

async function searchSongs(q) {
  q = String(q || '').trim().slice(0, 100);
  if (!q) return [];
  if (MOCK) { const n = norm(q); const r = MOCK_SONGS.filter(s => norm(s.title + ' ' + s.artist).includes(n)); return (r.length ? r : MOCK_SONGS).slice(0, 8); }
  const d = await dz('/search?limit=25&q=' + encodeURIComponent(q));
  const all = d.data || [];
  const ok = all.filter(t => t.preview && t.readable !== false);
  const clean = ok.filter(t => !isNoise(t));
  const hidden = ok.length - clean.length;
  return { results: clean.slice(0, 10).map(mapTrack), hidden, stats: { total: all.length, withPreview: all.filter(t => t.preview).length, readable: all.filter(t => t.readable !== false).length } };
}
async function freshPreview(id) {
  if (MOCK) return null;
  try { const t = await dz('/track/' + encodeURIComponent(id)); return t && t.preview ? t.preview : null; } catch (e) { return null; }
}

/* ------------------------------------------------------------------ */
/* Salas y jugadores                                                   */
/* ------------------------------------------------------------------ */
function makeGroups(n) { return PRESETS.slice(0, n).map((p, i) => ({ id: 'g' + i, name: p.name, color: p.color, score: 0, rot: 0, rot2: 0, fichas: T.FICHAS })); }

function createRoom() {
  const room = {
    code: newCode(), createdAt: now(), lastActivity: now(),
    groups: makeGroups(2), players: new Map(), tvConns: new Set(),
    phase: 'lobby', round: 0, deck: [], quota: 15, hostId: null,
    r1: null, r24: null, nextGroup: 0, carry: null
  };
  room.timer = setInterval(() => { try { tick(room); } catch (e) { console.error(e); } }, 200);
  rooms.set(room.code, room);
  return room;
}
const groupById = (room, id) => room.groups.find(g => g.id === id);
const groupPlayers = (room, gid) => [...room.players.values()].filter(p => p.groupId === gid).sort((a, b) => a.joinedAt - b.joinedAt);
const inDeck = (room, gid) => room.deck.filter(s => s.groupId === gid).length;

/* ------------------------------------------------------------------ */
/* Ronda 1 · La Selección                                              */
/* ------------------------------------------------------------------ */
function played(r) { return r.playedMs + (r.startedAt ? now() - r.startedAt : 0); }

function startR1(room) {
  room.phase = 'r1';
  room.r1 = { turnGroupIdx: -1 };
  nextR1Turn(room);
}
function nextR1Turn(room) {
  const n = room.groups.length;
  const prev = room.r1 ? room.r1.turnGroupIdx : -1;
  for (let k = 1; k <= n; k++) {
    const idx = (prev + k + n) % n;
    const g = room.groups[idx];
    if (inDeck(room, g.id) >= room.quota) continue;
    const ps = groupPlayers(room, g.id);
    if (!ps.length) continue;
    const proposer = ps[g.rot % ps.length];
    g.rot++;
    room.r1 = {
      turnGroupIdx: idx, groupId: g.id, proposerId: proposer.id, step: 'choosing', token: crypto.randomUUID(),
      song: null, queue: [], out: [], answering: null, firstBuzzAt: null, playedMs: 0, startedAt: null,
      reveal: null, revealUntil: 0, chooseDeadline: now() + 30000
    };
    return;
  }
  endRound(room);
}
async function r1Propose(room, p, song) {
  const r = room.r1;
  if (!r || r.step !== 'choosing' || r.proposerId !== p.id) fail('No es tu turno de proponer');
  if (!song || !song.id || !song.title) fail('Canción no válida');
  const key = norm(song.title) + '|' + norm(song.artist);
  if (room.deck.some(s => s.id === String(song.id) || norm(s.title) + '|' + norm(s.artist) === key)) fail('Esa canción ya está en el mazo');
  const s = { id: String(song.id), title: String(song.title).slice(0, 120), artist: String(song.artist || '').slice(0, 120), cover: String(song.cover || ''), preview: String(song.preview || '') };
  r.step = 'loading';
  r.song = s;
  const token = r.token;
  const fresh = await freshPreview(s.id);
  if (room.r1 !== r || r.token !== token) return;
  s.preview = fresh || s.preview;
  if (!s.preview) { r.step = 'choosing'; r.song = null; fail('Esta canción no tiene fragmento'); }
  p.list = p.list.filter(x => x.id !== s.id);
  r.step = 'playing';
  r.startedAt = now();
}
function r1Buzz(room, p) {
  const r = room.r1;
  if (!r || (r.step !== 'playing' && r.step !== 'answering')) fail('Ahora no se puede pulsar');
  if (!p.groupId || p.groupId === r.groupId) fail('No podéis pulsar en vuestra canción');
  if (played(r) >= T.PREVIEW) fail('La canción ya ha terminado');
  if (r.out.includes(p.groupId) || r.queue.some(q => q.groupId === p.groupId) || (r.answering && r.answering.groupId === p.groupId)) return;
  const at = now();
  if (!r.firstBuzzAt) r.firstBuzzAt = at;
  r.queue.push({ groupId: p.groupId, at });
  if (r.step === 'playing') r1StartAnswer(room);
}
function r1StartAnswer(room) {
  const r = room.r1;
  const next = r.queue.shift();
  if (r.startedAt) { r.playedMs += now() - r.startedAt; r.startedAt = null; }
  r.answering = { groupId: next.groupId, at: next.at, deadline: now() + T.ANSWER };
  r.step = 'answering';
}
function r1Judge(room, p, verdict, auto) {
  const r = room.r1;
  if (!r || r.step !== 'answering') fail('No hay nadie respondiendo');
  if (!auto && r.proposerId !== p.id) fail('Solo juzga quien propuso la canción');
  const g = groupById(room, r.answering.groupId);
  if (verdict === 'title') {
    const pts = 2 + (r.playedMs < T.BONUS ? 1 : 0);
    g.score += pts;
    const pg = groupById(room, r.groupId);
    pg.score += 1;
    room.deck.push({ ...r.song, groupId: r.groupId });
    r.reveal = { result: 'in', winnerGroupId: g.id, pts };
    r.answering = null;
    r.step = 'reveal';
    r.revealUntil = now() + T.REVEAL;
    return;
  }
  if (verdict === 'artist') g.score += 1;
  else g.score -= 1;
  r.out.push(g.id);
  r.lastVerdict = { groupId: g.id, verdict: verdict === 'artist' ? 'artist' : 'fail', at: now() };
  r.answering = null;
  if (r.queue.length) return r1StartAnswer(room);
  if (r.playedMs >= T.PREVIEW) return r1Discard(room);
  r.step = 'playing';
  r.startedAt = now();
}
function r1Discard(room) {
  const r = room.r1;
  if (r.startedAt) { r.playedMs += now() - r.startedAt; r.startedAt = null; }
  r.reveal = { result: 'discard' };
  r.answering = null;
  r.step = 'reveal';
  r.revealUntil = now() + T.REVEAL;
}
function tickR1(room) {
  const r = room.r1;
  if (!r) return false;
  if (r.step === 'playing' && played(r) >= T.PREVIEW) { r1Discard(room); return true; }
  if (r.step === 'answering' && now() > r.answering.deadline) { r1Judge(room, null, 'fail', true); return true; }
  if (r.step === 'reveal' && now() > r.revealUntil) { nextR1Turn(room); return true; }
  return false;
}

/* ------------------------------------------------------------------ */
/* Rondas 2–4                                                          */
/* ------------------------------------------------------------------ */
function startR24(room) {
  room.phase = 'r24';
  room.groups.forEach(g => { g.fichas = T.FICHAS; });
  const deck = shuffle(room.deck.map(s => ({ ...s })));
  room.r24 = { deck, current: null, step: 'ready', hits: 0, lastHit: null, falta: null, faltaResult: null, summary: null };
  if (room.carry) { setupTurn(room, room.carry.groupIdx, room.carry.remainingMs); room.carry = null; }
  else setupTurn(room, room.nextGroup % room.groups.length, null);
}
function setupTurn(room, idx, carryMs) {
  const n = room.groups.length;
  for (let k = 0; k < n; k++) {
    const g = room.groups[(idx + k) % n];
    const ps = groupPlayers(room, g.id);
    if (!ps.length) continue;
    const clue = ps[g.rot2 % ps.length];
    g.rot2++;
    Object.assign(room.r24, {
      groupIdx: (idx + k) % n, groupId: g.id, clueGiverId: clue.id, step: 'ready',
      carryMs: k === 0 ? carryMs : null, deadline: null, remainingMs: null, hits: 0, lastHit: null, falta: null, summary: null, current: null
    });
    return;
  }
}
function turnLen(room) { return T.TURN[room.round] || 45000; }
function r24Begin(room, p) {
  const r = room.r24;
  if (!r || r.step !== 'ready' || r.clueGiverId !== p.id) fail('No te toca empezar');
  r.step = 'playing';
  r.turnTotal = r.carryMs || turnLen(room);
  r.deadline = now() + r.turnTotal;
  r.carryMs = null;
  r.hits = 0;
  drawCard(room);
}
function drawCard(room) {
  const r = room.r24;
  if (!r.deck.length) return endR24Round(room);
  const c = r.deck.shift();
  c.previewUrl = c.preview;
  c.drawId = crypto.randomUUID();
  r.current = c;
  freshPreview(c.id).then(u => { if (u && room.r24 && room.r24.current && room.r24.current.drawId === c.drawId) { c.previewUrl = u; broadcast(room); } });
}
function r24Hit(room, p) {
  const r = room.r24;
  if (!r || r.step !== 'playing' || r.clueGiverId !== p.id || !r.current) fail('Ahora no');
  const pts = ROUND_PTS[room.round];
  groupById(room, r.groupId).score += pts;
  r.hits++;
  r.lastHit = { song: r.current, at: now(), groupId: r.groupId, pts };
  r.current = null;
  drawCard(room);
}
function r24Pass(room, p) {
  const r = room.r24;
  if (!r || r.step !== 'playing' || r.clueGiverId !== p.id || !r.current) fail('Ahora no');
  r.deck.push(r.current);
  r.current = null;
  drawCard(room);
}
function endTurn(room) {
  const r = room.r24;
  if (r.current) { r.deck.push(r.current); r.current = null; }
  r.summary = { groupId: r.groupId, hits: r.hits, pts: r.hits * ROUND_PTS[room.round] };
  r.step = 'turnEnd';
  r.turnEndUntil = now() + T.TURN_END;
  room.nextGroup = r.groupIdx + 1;
}
function endR24Round(room) {
  const r = room.r24;
  const remaining = r.deadline ? r.deadline - now() : 0;
  if (remaining > T.CARRY_MIN) room.carry = { groupIdx: r.groupIdx, remainingMs: remaining };
  else { room.carry = null; room.nextGroup = r.groupIdx + 1; }
  endRound(room);
}
function r24Falta(room, p) {
  const r = room.r24;
  if (!r || r.step !== 'playing') fail('Ahora no se puede reclamar');
  if (!p.groupId || p.groupId === r.groupId) fail('Solo pueden reclamar los rivales');
  const g = groupById(room, p.groupId);
  if (g.fichas <= 0) fail('Sin fichas de falta en esta ronda');
  const recentHit = r.lastHit && now() - r.lastHit.at < T.HIT_WINDOW;
  const target = recentHit ? 'hit' : (r.current ? 'current' : null);
  if (!target) fail('No hay carta que reclamar');
  g.fichas--;
  r.remainingMs = Math.max(0, r.deadline - now());
  r.step = 'falta';
  r.falta = {
    claimGroupId: g.id, claimBy: p.id, accusedGroupId: r.groupId, target,
    song: target === 'hit' ? r.lastHit.song : r.current, hit: target === 'hit' ? r.lastHit : null,
    accused: null, claim: null, votes: {}, deadline: now() + T.FALTA
  };
}
function neutralGroups(room, f) { return room.groups.filter(g => g.id !== f.claimGroupId && g.id !== f.accusedGroupId && groupPlayers(room, g.id).length); }
function r24FaltaChoice(room, p, choice) {
  const r = room.r24;
  if (!r || r.step !== 'falta') fail('No hay ninguna falta abierta');
  const f = r.falta;
  if (p.groupId === f.accusedGroupId) {
    if (p.id !== r.clueGiverId) fail('Responde quien daba las pistas');
    if (choice === 'admit') return resolveFalta(room, 'mala');
    if (choice === 'deny') f.accused = 'deny';
  } else if (p.groupId === f.claimGroupId) {
    if (choice === 'retire') return resolveFalta(room, 'buena');
    if (choice === 'insist') f.claim = 'insist';
  } else {
    if (choice !== 'buena' && choice !== 'mala') fail('Voto no válido');
    f.votes[p.groupId] = choice;
  }
  checkFalta(room, false);
}
function checkFalta(room, timeout) {
  const f = room.r24.falta;
  const neutrals = neutralGroups(room, f);
  const votes = neutrals.map(g => f.votes[g.id]).filter(Boolean);
  const allVoted = neutrals.length && votes.length === neutrals.length;
  if (allVoted || (timeout && votes.length)) {
    const b = votes.filter(v => v === 'buena').length, m = votes.filter(v => v === 'mala').length;
    return resolveFalta(room, b > m ? 'buena' : m > b ? 'mala' : 'pasar');
  }
  if (!neutrals.length && f.accused === 'deny' && f.claim === 'insist') return resolveFalta(room, 'pasar');
  if (timeout) resolveFalta(room, 'pasar');
}
function resolveFalta(room, decision) {
  const r = room.r24;
  const f = r.falta;
  const claim = groupById(room, f.claimGroupId);
  if (decision === 'mala') claim.fichas++;
  if (f.target === 'hit' && decision !== 'buena') {
    groupById(room, f.hit.groupId).score -= f.hit.pts;
    r.hits = Math.max(0, r.hits - 1);
    r.deck.push(f.hit.song);
  }
  if (r.current) { r.deck.push(r.current); r.current = null; }
  r.lastHit = null;
  r.faltaResult = { decision, claimGroupId: f.claimGroupId, accusedGroupId: f.accusedGroupId, until: now() + 3500 };
  r.falta = null;
  r.step = 'playing';
  r.deadline = now() + r.remainingMs;
  drawCard(room);
}
function tickR24(room) {
  const r = room.r24;
  if (!r) return false;
  if (r.step === 'playing' && now() >= r.deadline) { endTurn(room); return true; }
  if (r.step === 'falta' && now() >= r.falta.deadline) { checkFalta(room, true); return true; }
  if (r.step === 'turnEnd' && now() >= r.turnEndUntil) { setupTurn(room, room.nextGroup % room.groups.length, null); return true; }
  if (r.faltaResult && now() > r.faltaResult.until) { r.faltaResult = null; return true; }
  return false;
}

/* ------------------------------------------------------------------ */
/* Flujo general                                                       */
/* ------------------------------------------------------------------ */
function endRound(room) {
  room.r1 = null;
  room.r24 = null;
  room.phase = room.round >= 4 ? 'final' : 'standings';
}
function tick(room) {
  let changed = false;
  if (room.phase === 'r1') changed = tickR1(room);
  else if (room.phase === 'r24') changed = tickR24(room);
  if (changed) broadcast(room);
  if (now() - room.lastActivity > 6 * 3600 * 1000) { clearInterval(room.timer); rooms.delete(room.code); }
}

async function handleAction(room, p, a) {
  const host = room.hostId === p.id;
  const needHost = () => { if (!host) fail('Solo el anfitrión puede hacerlo'); };
  switch (a.type) {
    case 'setGroups': {
      needHost(); if (room.phase !== 'lobby') fail('La partida ya ha empezado');
      const n = Math.max(2, Math.min(5, a.n | 0));
      const old = room.groups;
      room.groups = makeGroups(n).map((g, i) => old[i] ? { ...g, name: old[i].name } : g);
      room.players.forEach(pl => { if (pl.groupId && !groupById(room, pl.groupId)) pl.groupId = null; });
      break;
    }
    case 'joinGroup': {
      if (!groupById(room, a.groupId)) fail('Grupo no válido');
      if (room.phase !== 'lobby' && p.groupId) fail('Ya tienes grupo');
      p.groupId = a.groupId;
      break;
    }
    case 'listAdd': {
      const s = a.song;
      if (!s || !s.id || p.list.some(x => x.id === String(s.id))) break;
      if (p.list.length >= 30) fail('Tu lista está llena');
      p.list.push({ id: String(s.id), title: String(s.title).slice(0, 120), artist: String(s.artist || '').slice(0, 120), cover: String(s.cover || ''), preview: String(s.preview || '') });
      break;
    }
    case 'listRemove': p.list = p.list.filter(x => x.id !== String(a.id)); break;
    case 'start': {
      needHost(); if (room.phase !== 'lobby') fail('Ya ha empezado');
      const used = room.groups.filter(g => groupPlayers(room, g.id).length);
      if (used.length < 2) fail('Hacen falta al menos 2 grupos con jugadores');
      room.groups = used;
      room.quota = Math.floor(T.DECK_TOTAL / used.length);
      room.round = 1;
      room.phase = 'roundIntro';
      break;
    }
    case 'beginRound': {
      needHost(); if (room.phase !== 'roundIntro') fail('Ahora no');
      if (room.round === 1) startR1(room); else startR24(room);
      break;
    }
    case 'next': {
      needHost(); if (room.phase !== 'standings') fail('Ahora no');
      if (room.round === 1 && room.deck.length < 2) fail('El mazo necesita al menos 2 canciones');
      room.round++;
      room.phase = 'roundIntro';
      break;
    }
    case 'endRound': {
      needHost();
      if (room.phase === 'r1') { if (room.r1 && room.r1.step !== 'choosing' && room.r1.step !== 'reveal') fail('Espera a que acabe la canción'); endRound(room); }
      else if (room.phase === 'r24') endRound(room);
      else fail('Ahora no');
      break;
    }
    case 'skipTurn': {
      needHost();
      if (room.phase === 'r1' && room.r1 && room.r1.step === 'choosing') nextR1Turn(room);
      else if (room.phase === 'r24' && room.r24 && room.r24.step === 'ready') setupTurn(room, room.r24.groupIdx + 1, null);
      else fail('Solo se puede pasar un turno que no ha empezado');
      break;
    }
    case 'restart': {
      needHost(); if (room.phase !== 'final') fail('Ahora no');
      room.groups.forEach(g => { g.score = 0; g.rot = 0; g.rot2 = 0; g.fichas = T.FICHAS; });
      Object.assign(room, { phase: 'lobby', round: 0, deck: [], r1: null, r24: null, nextGroup: 0, carry: null });
      break;
    }
    case 'propose': await r1Propose(room, p, a.song); break;
    case 'buzz': r1Buzz(room, p); break;
    case 'judge': r1Judge(room, p, a.verdict === 'title' ? 'title' : a.verdict === 'artist' ? 'artist' : 'fail'); break;
    case 'begin': r24Begin(room, p); break;
    case 'hit': r24Hit(room, p); break;
    case 'pass': r24Pass(room, p); break;
    case 'falta': r24Falta(room, p); break;
    case 'faltaChoice': r24FaltaChoice(room, p, a.choice); break;
    default: fail('Acción desconocida');
  }
}

/* ------------------------------------------------------------------ */
/* Vistas personalizadas (cada uno ve solo lo que debe)                */
/* ------------------------------------------------------------------ */
const pub = s => s && { id: s.id, title: s.title, artist: s.artist, cover: s.cover };
function view(room, p) {
  const v = {
    now: now(), code: room.code, phase: room.phase, round: room.round, quota: room.quota, deckSize: room.deck.length, hostId: room.hostId,
    groups: room.groups.map(g => ({
      id: g.id, name: g.name, color: g.color, score: g.score, fichas: g.fichas, inDeck: inDeck(room, g.id),
      players: groupPlayers(room, g.id).map(pl => ({ id: pl.id, name: pl.name, online: pl.conns.size > 0 }))
    })),
    unassigned: [...room.players.values()].filter(pl => !pl.groupId).map(pl => ({ id: pl.id, name: pl.name })),
    T: { PREVIEW: T.PREVIEW, BONUS: T.BONUS, ANSWER: T.ANSWER }
  };
  if (p) v.me = { id: p.id, name: p.name, groupId: p.groupId, isHost: room.hostId === p.id, list: p.list };
  const r = room.r1;
  if (room.phase === 'r1' && r) {
    const prop = room.players.get(r.proposerId);
    const queue = [];
    if (r.answering) queue.push({ groupId: r.answering.groupId, delta: r.answering.at - r.firstBuzzAt, answering: true });
    r.queue.forEach(q => queue.push({ groupId: q.groupId, delta: q.at - r.firstBuzzAt }));
    v.r1 = {
      step: r.step, groupId: r.groupId, proposerId: r.proposerId, proposerName: prop ? prop.name : '?',
      queue, out: r.out, answeringDeadline: r.answering ? r.answering.deadline : null,
      playedMs: played(r), playing: !!r.startedAt, chooseDeadline: r.chooseDeadline,
      lastVerdict: r.lastVerdict && now() - r.lastVerdict.at < 2500 ? r.lastVerdict : null,
      reveal: r.step === 'reveal' ? { ...r.reveal, song: pub(r.song) } : null
    };
    if (p && p.id === r.proposerId && r.song) { v.r1.song = pub(r.song); v.r1.songPreview = r.song.preview; }
    if (!p && r.song && (r.step === 'playing' || r.step === 'answering')) v.r1.audio = { url: r.song.preview, key: r.token, playing: !!r.startedAt, offsetMs: played(r) };
  }
  const q = room.r24;
  if (room.phase === 'r24' && q) {
    const cg = room.players.get(q.clueGiverId);
    v.r24 = {
      step: q.step, groupId: q.groupId, clueGiverId: q.clueGiverId, clueGiverName: cg ? cg.name : '?',
      deadline: q.deadline, remainingMs: q.step === 'falta' ? q.remainingMs : null, turnMs: q.turnTotal || q.carryMs || turnLen(room),
      hits: q.hits, deckLeft: q.deck.length + (q.current ? 1 : 0), summary: q.summary, faltaResult: q.faltaResult,
      falta: q.falta ? {
        claimGroupId: q.falta.claimGroupId, accusedGroupId: q.falta.accusedGroupId, target: q.falta.target,
        song: pub(q.falta.song), accused: q.falta.accused, claim: q.falta.claim, votes: q.falta.votes, deadline: q.falta.deadline,
        neutralIds: neutralGroups(room, q.falta).map(g => g.id)
      } : null
    };
    if (p && q.current) {
      if (p.id === q.clueGiverId) v.r24.card = { ...pub(q.current), previewUrl: q.current.previewUrl, drawId: q.current.drawId };
      else if (p.groupId && p.groupId !== q.groupId) v.r24.card = pub(q.current);
    }
  }
  return v;
}
function send(res, data) { try { res.write('data: ' + JSON.stringify(data) + '\n\n'); } catch (e) { /* conexión cerrada */ } }
function broadcast(room) {
  room.lastActivity = now();
  if (room.tvConns.size) { const tv = view(room, null); room.tvConns.forEach(res => send(res, tv)); }
  room.players.forEach(p => { if (p.conns.size) { const v = view(room, p); p.conns.forEach(res => send(res, v)); } });
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
function json(res, code, data) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', c => { b += c; if (b.length > 65536) { reject(new Error('Demasiado grande')); req.destroy(); } });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(new Error('JSON no válido')); } });
  });
}
function serveFile(res, file) {
  const fp = path.join(PUBLIC_DIR, file);
  if (!fp.startsWith(PUBLIC_DIR)) return json(res, 404, { error: 'No encontrado' });
  fs.readFile(fp, (err, data) => {
    if (err) return json(res, 404, { error: 'No encontrado' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) return serveFile(res, 'phone.html');
    if (req.method === 'GET' && (p === '/tv' || p === '/tv/')) return serveFile(res, 'tv.html');
    if (req.method === 'GET' && p === '/health') return json(res, 200, { ok: true, rooms: rooms.size, mock: MOCK });

    if (req.method === 'GET' && p === '/api/info') return json(res, 200, { lan: lanUrls() });
    if (req.method === 'GET' && p === '/api/room') return json(res, 200, { exists: rooms.has(String(url.searchParams.get('code') || '').toUpperCase()) });
    if (req.method === 'POST' && p === '/api/rooms') { const room = createRoom(); return json(res, 200, { code: room.code }); }

    if (req.method === 'POST' && p === '/api/join') {
      const b = await readBody(req);
      const room = rooms.get(String(b.room || '').toUpperCase());
      if (!room) return json(res, 404, { error: 'No existe esa sala' });
      const name = String(b.name || '').trim().slice(0, 20);
      let pl = b.pid && room.players.get(b.pid);
      if (!pl) {
        if (!name) return json(res, 400, { error: 'Escribe tu nombre' });
        pl = { id: crypto.randomUUID(), name, groupId: null, list: [], conns: new Set(), joinedAt: now() };
        room.players.set(pl.id, pl);
      } else if (name) pl.name = name;
      if (!room.hostId || !room.players.has(room.hostId)) room.hostId = pl.id;
      broadcast(room);
      return json(res, 200, { pid: pl.id });
    }

    if (req.method === 'GET' && p === '/api/events') {
      const room = rooms.get(String(url.searchParams.get('room') || '').toUpperCase());
      if (!room) return json(res, 404, { error: 'No existe esa sala' });
      const isTv = url.searchParams.get('tv') === '1';
      const pl = isTv ? null : room.players.get(url.searchParams.get('pid'));
      if (!isTv && !pl) return json(res, 404, { error: 'Jugador desconocido' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 2000\n\n');
      const set = isTv ? room.tvConns : pl.conns;
      set.add(res);
      broadcast(room);
      req.on('close', () => { set.delete(res); broadcast(room); });
      return;
    }

    if (req.method === 'POST' && p === '/api/action') {
      const b = await readBody(req);
      const room = rooms.get(String(b.room || '').toUpperCase());
      if (!room) return json(res, 404, { error: 'No existe esa sala' });
      const pl = room.players.get(b.pid);
      if (!pl) return json(res, 404, { error: 'Jugador desconocido' });
      try { await handleAction(room, pl, b); }
      catch (e) { broadcast(room); return json(res, 400, { error: e instanceof GameError ? e.message : 'Error' }); }
      broadcast(room);
      return json(res, 200, { ok: true });
    }

    if (req.method === 'GET' && p === '/api/search') {
      try {
        const r = await searchSongs(url.searchParams.get('q'));
        return json(res, 200, Array.isArray(r) ? { results: r, hidden: 0 } : r);
      } catch (e) { console.error('search', e.message); return json(res, 502, { error: 'No se pudo buscar en Deezer', detail: String(e.message || e).slice(0, 300) }); }
    }
    if (req.method === 'GET' && p === '/api/preview') {
      const u = await freshPreview(url.searchParams.get('id'));
      return json(res, 200, { preview: u });
    }

    if (req.method === 'GET' && /^\/[\w.-]+\.(js|css|svg|png|ico)$/.test(p)) return serveFile(res, p.slice(1));
    json(res, 404, { error: 'No encontrado' });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: 'Error del servidor' });
  }
});

setInterval(() => { rooms.forEach(room => { room.tvConns.forEach(r => { try { r.write(': ping\n\n'); } catch (e) {} }); room.players.forEach(p => p.conns.forEach(r => { try { r.write(': ping\n\n'); } catch (e) {} })); }); }, 15000);

if (require.main === module) server.listen(PORT, () => {
  console.log(`\n  Hit's Up está en marcha${MOCK ? ' [Deezer simulado]' : ''}`);
  console.log(`  TV (en este ordenador):  http://localhost:${PORT}/tv`);
  const lan = lanUrls();
  if (lan.length) console.log(`  Móviles (misma wifi):    ${lan[0]}${lan.length > 1 ? '   (otras: ' + lan.slice(1).join(', ') + ')' : ''}`);
  console.log('\n  Deja esta ventana abierta mientras jugáis. Para parar: Ctrl+C\n');
});
module.exports = { server, rooms, T };
