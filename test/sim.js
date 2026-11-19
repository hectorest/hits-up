'use strict';
// Partida simulada completa contra el servidor (Deezer simulado, tiempos acelerados).
process.env.DEEZER_MOCK = '1';
const { server, T } = require('../server.js');
// Acelerar tiempos para la prueba
Object.assign(T, { PREVIEW: 3000, ANSWER: 800, JUDGE_MAX: 1500, REVEAL_HIT: 300, BONUS: 1500, REVEAL: 300, TURN: { 2: 2500, 3: 8000, 4: 2500 }, TURN_END: 300, FALTA: 1500, DECK_TOTAL: 6, CARRY_MIN: 300, HIT_WINDOW: 400 });

const PORT = 3999;
const base = `http://localhost:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const post = async (p, b) => (await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json();
let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.log('  ✗ ' + msg); } else console.log('  ✓ ' + msg); };

function listen(url, onState) {
  const ctrl = new AbortController();
  (async () => {
    const r = await fetch(url, { signal: ctrl.signal });
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i; while ((i = buf.indexOf('\n\n')) >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2); const line = chunk.split('\n').find(l => l.startsWith('data: ')); if (line) onState(JSON.parse(line.slice(6))); }
      }
    } catch (e) {}
  })();
  return () => ctrl.abort();
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const { code } = await post('/api/rooms', {});
  const states = {}; let tv = null;
  const stops = [listen(`${base}/api/events?room=${code}&tv=1`, s => tv = s)];
  const P = {};
  for (const name of ['Ana', 'Bea', 'Carlos', 'Dani', 'Eva']) {
    const { pid } = await post('/api/join', { room: code, name });
    P[name] = pid;
    stops.push(listen(`${base}/api/events?room=${code}&pid=${pid}`, s => states[name] = s));
  }
  const act = (name, type, extra = {}) => post('/api/action', { room: code, pid: P[name], type, ...extra });
  await sleep(200);
  console.log('Sala', code);
  check(states.Ana.me.isHost, 'Ana es anfitriona');
  check((await act('Bea', 'setGroups', { n: 3 })).error, 'Solo la anfitriona cambia grupos');
  await act('Ana', 'setGroups', { n: 3 });
  await act('Ana', 'joinGroup', { groupId: 'g0' }); await act('Bea', 'joinGroup', { groupId: 'g0' });
  await act('Carlos', 'joinGroup', { groupId: 'g1' }); await act('Dani', 'joinGroup', { groupId: 'g1' });
  await act('Eva', 'joinGroup', { groupId: 'g2' });
  check((await act('Eva', 'renameGroup', { groupId: 'g0', name: 'Intrusos' })).error, 'No se puede renombrar un grupo ajeno');
  await act('Bea', 'renameGroup', { groupId: 'g0', name: '  Los   <b>Fieras</b>  ' }); await sleep(80);
  check(tv.groups[0].name === 'Los <b>Fieras</b>', 'Un miembro renombra su grupo (se recorta y guarda el texto tal cual)');
  check((await act('Carlos', 'renameGroup', { groupId: 'g1', name: 'los <b>fieras</b>' })).error, 'No se repiten nombres de grupo');
  const search = await (await fetch(base + '/api/search?q=queen')).json();
  check(search.results.length > 0, 'Búsqueda devuelve resultados');
  await act('Ana', 'listAdd', { song: search.results[0] });
  await sleep(100);
  check(states.Ana.me.list.length === 1, 'Lista personal guarda canciones');
  await act('Ana', 'start'); await sleep(100);
  check(tv.phase === 'roundIntro' && tv.quota === 2, 'Empieza ronda 1 con cuota 2 por grupo (mazo 6 / 3 grupos)');
  await act('Ana', 'beginRound'); await sleep(100);
  check(tv.phase === 'r1' && tv.r1.step === 'choosing', 'Ronda 1: eligiendo');

  // --- Ronda 1 ---
  const names = Object.keys(P);
  const byId = id => names.find(n => P[n] === id);
  const songs = (await (await fetch(base + '/api/search?q=zzz')).json()).results;
  let si = 0, guard = 0, sawBonus = false, sawDiscard = false, sawArtist = false, sawLeak = false;
  while (tv.phase === 'r1' && guard++ < 600) {
    const r1 = tv.r1;
    if (r1.step !== 'choosing') { await sleep(80); continue; }
    const prop = byId(r1.proposerId);
    const groupId = r1.groupId;
    // Propuesta duplicada
    if (si > 0 && guard === 3) { const d = await act(prop, 'propose', { song: songs[0] }); check(d.error, 'No se puede repetir una canción del mazo'); }
    const res = await act(prop, 'propose', { song: songs[si++ % songs.length] });
    if (res.error) { console.log('   propose error', res.error); continue; }
    await sleep(80);
    // Nadie fuera del proponente debe ver la canción
    names.filter(n => n !== prop).forEach(n => { if (states[n].r1 && states[n].r1.song) sawLeak = true; });
    if (tv.r1.song) sawLeak = true;
    const seen = new Set();
    const rivals = names.filter(n => { const g = states[n].me.groupId; if (!g || g === groupId || seen.has(g)) return false; seen.add(g); return true; });
    const own = names.find(n => n !== prop && states[n].me.groupId === groupId);
    if (own) { const b = await act(own, 'buzz'); if (!b.error) sawLeak = true; }
    const mode = si % 4;
    if (mode === 0) { const end = Date.now() + T.PREVIEW + 600; while (Date.now() < end) { if (tv.r1 && tv.r1.reveal && tv.r1.reveal.result === 'discard') sawDiscard = true; await sleep(40); } }
    else {
      await act(rivals[0], 'buzz'); await act(rivals[1], 'buzz'); await sleep(60);
      check(tv.r1.step === 'answering' && tv.r1.queue.length >= 1 && tv.r1.audio && !tv.r1.audio.playing, 'Al pulsar se pausa la música y se forma la cola');
      if (mode === 1) {
        await sleep(T.ANSWER + 300);
        check(tv.r1.step === 'answering' && tv.r1.answeringExpired, 'Pasados los 5 s no cuenta como fallo: decide el juez');
        await act(prop, 'judge', { verdict: 'title' }); await sleep(40);
        check(tv.r1.step === 'reveal' && tv.r1.reveal.result === 'in', 'El juez puede dar por buena la respuesta tras los 5 s');
        check(tv.r1.audio && tv.r1.audio.playing, 'Al acertar, la canción se reanuda en la TV durante la revelación');
        sawBonus = true;
      }
      else if (mode === 2) { await act(prop, 'judge', { verdict: 'artist' }); await sleep(60); sawArtist = true; if (tv.r1.step === 'answering') await act(prop, 'judge', { verdict: 'title' }); }
      else {
        await act(prop, 'judge', { verdict: 'fail' }); await sleep(60);
        if (tv.r1.step === 'playing') check(tv.r1.audio && tv.r1.audio.playing, 'Tras un fallo, la canción se reanuda en la TV');
        if (tv.r1.step === 'answering') await act(prop, 'judge', { verdict: 'title' });
      }
    }
    await sleep(T.REVEAL + 300);
  }
  check(!sawLeak, 'Solo el proponente ve la canción y su grupo no puede pulsar');
  check(sawBonus && sawArtist && sawDiscard, 'Probados acierto, solo artista y descarte');
  check(tv.phase === 'standings', 'Ronda 1 termina al completar las cuotas');
  check(tv.groups.every(g => g.inDeck === 2) && tv.deckSize === 6, 'Cada grupo tiene 2 canciones en el mazo');
  console.log('   Puntos tras R1:', tv.groups.map(g => g.name + ' ' + g.score).join(', '));

  // --- Rondas 2-4 ---
  for (let round = 2; round <= 4; round++) {
    await act('Ana', 'next'); await sleep(60);
    check(tv.phase === 'roundIntro' && tv.round === round, `Intro ronda ${round}`);
    await act('Ana', 'beginRound'); await sleep(80);
    let loops = 0, faltaTested = false;
    while (tv.phase === 'r24' && loops++ < 60) {
      const q = tv.r24;
      if (q.step === 'ready') { await act(byId(q.clueGiverId), 'begin'); await sleep(60); continue; }
      if (q.step === 'playing') {
        const clue = byId(q.clueGiverId);
        const mate = names.find(n => n !== clue && states[n].me.groupId === q.groupId);
        const rival = names.find(n => states[n].me.groupId && states[n].me.groupId !== q.groupId);
        if (mate) check(!states[mate].r24.card, `R${round}: el compañero no ve la carta`);
        check(states[clue].r24.card && states[rival].r24.card && !tv.r24.card, `R${round}: carta visible para quien da pistas y rivales, no en la TV`);
        if (!faltaTested && round === 3) {
          faltaTested = true;
          await act(clue, 'hit'); await sleep(40);
          const before = tv.groups.find(g => g.id === q.groupId).score;
          await act(rival, 'falta'); await sleep(60);
          check(tv.r24.step === 'falta' && tv.r24.falta.target === 'hit', 'Falta justo tras un acierto apunta a esa carta');
          await act(clue, 'faltaChoice', { choice: 'admit' }); await sleep(60);
          const after = tv.groups.find(g => g.id === q.groupId).score;
          check(after === before - 3, 'Falta reconocida: se retiran los puntos de la carta');
          check(tv.groups.find(g => g.id === states[rival].me.groupId).fichas === 2, 'Falta reconocida: se devuelve la ficha');
          // Segunda falta sin acuerdo con neutrales
          await sleep(T.HIT_WINDOW + 100);
          await act(rival, 'falta'); await sleep(40);
          const neutral = names.find(n => { const g = states[n].me.groupId; return g && g !== q.groupId && g !== states[rival].me.groupId; });
          await act(clue, 'faltaChoice', { choice: 'deny' }); await act(rival, 'faltaChoice', { choice: 'insist' });
          if (neutral) await act(neutral, 'faltaChoice', { choice: 'buena' });
          await sleep(60);
          check(tv.r24.step === 'playing' && tv.r24.faltaResult && tv.r24.faltaResult.decision === 'buena', 'Sin acuerdo deciden los neutrales');
          check(tv.groups.find(g => g.id === states[rival].me.groupId).fichas === 1, 'Falta perdida gasta la ficha');
          continue;
        }
        const r = await act(clue, Math.random() < 0.75 ? 'hit' : 'pass');
        if (r.error) { await sleep(40); }
        await sleep(30);
        continue;
      }
      await sleep(60);
    }
    check(tv.phase === (round < 4 ? 'standings' : 'final'), `Ronda ${round} termina al vaciar el mazo`);
    console.log(`   Puntos tras R${round}:`, tv.groups.map(g => g.name + ' ' + g.score).join(', '));
  }
  await act('Ana', 'restart'); await sleep(60);
  check(tv.phase === 'lobby' && tv.groups.every(g => g.score === 0), 'Otra partida reinicia la sala');
  stops.forEach(s => s());
  console.log(failures ? `\n${failures} comprobaciones fallidas` : '\nTodo OK');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
