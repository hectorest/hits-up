'use strict';
// Partida simulada completa contra el servidor (Deezer simulado, tiempos acelerados).
process.env.DEEZER_MOCK = '1';
const { server, T } = require('../server.js');
// Acelerar tiempos para la prueba
Object.assign(T, { CELEBRATE: 150, PREVIEW: 3000, ANSWER: 800, JUDGE_MAX: 1500, REVEAL_HIT: 300, KEEP_DECIDE: 700, REVEAL_SHORT: 200, BONUS: 1500, REVEAL: 300, TURN: { 2: 2500, 3: 8000, 4: 2500 }, TURN_END: 300, FALTA: 1500, DECK_TOTAL: 6, CARRY_MIN: 300, HIT_WINDOW: 400 });

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
  let keepTurn = 0; let si = 0, guard = 0, sawBonus = false, sawDiscard = false, sawArtist = false, sawLeak = false;
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
    if (mode === 0) {
      const end = Date.now() + T.PREVIEW + 600;
      while (Date.now() < end && !(tv.r1 && tv.r1.reveal && tv.r1.reveal.pending)) await sleep(40);
      check(tv.r1 && tv.r1.reveal && tv.r1.reveal.pending, 'Si nadie acierta, toca decidir si entra al mazo');
      check((await act(rivals[0], 'keep', { keep: true })).error, 'Solo decide quien propuso la canción');
      const before = tv.deckSize, scores = tv.groups.map(g => g.score).join();
      keepTurn = (keepTurn || 0) + 1;
      if (keepTurn === 1) { await act(prop, 'keep', { keep: false }); await sleep(60); check(tv.deckSize === before && tv.r1.reveal.result === 'discard', 'Descartar: no entra al mazo'); }
      else if (keepTurn === 2) { await act(prop, 'keep', { keep: true }); await sleep(60); check(tv.deckSize === before + 1 && tv.r1.reveal.result === 'kept', 'Meter en el mazo: entra sin acertar'); }
      else { await sleep(T.KEEP_DECIDE + 300); check(tv.phase !== 'r1' || tv.deckSize === before + 1, 'Sin decisión, entra al mazo por defecto'); }
      check(tv.groups.map(g => g.score).join() === scores, 'Entrar sin acertar no da puntos');
      sawDiscard = true;
    }
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
  let handoffTested = false;
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
        if (round === 2 && !handoffTested) {
          handoffTested = true;
          T.CELEBRATE = 5000; const prevLen = T.PREVIEW; T.PREVIEW = 30000;
          const left = q.deadline - Date.now();
          await act(clue, 'hit', { pos: 7.5, at: Date.now() - 100 }); await sleep(60);
          check(tv.r24.step === 'celebrate' && tv.r24.audio && tv.r24.audio.playing, 'Al acertar, la canción pasa a sonar en la tele');
          check(tv.r24.audio && tv.r24.audio.offsetMs >= 7500 && tv.r24.audio.offsetMs < 8500, 'La tele sigue desde el punto exacto de los auriculares');
          check(!states[clue].r24.audio && !states[rival].r24.audio, 'Los móviles no reciben ese audio');
          check((await act(rival, 'hit')).error, 'Durante la celebración no se puede marcar otra');
          await sleep(300);
          await act(clue, 'resume'); await sleep(60);
          check(tv.r24.step === 'playing' && Math.abs((tv.r24.deadline - Date.now()) - left) < 700, 'El reloj se para durante la celebración y sigue después');
          T.CELEBRATE = 150; T.PREVIEW = prevLen;
          continue;
        }
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

  // ---- Modo App de Spotify ----
  console.log('Modo Spotify');
  check((await act('Bea', 'setMusic', { music: 'spotify' })).error, 'Solo la anfitriona elige la música');
  await act('Ana', 'setMusic', { music: 'spotify' }); await sleep(60);
  check(tv.music === 'spotify', 'La anfitriona elige la app de Spotify');
  await act('Ana', 'start'); await sleep(60); await act('Ana', 'beginRound'); await sleep(80);
  const nameOf = id => Object.keys(P).find(n => P[n] === id);
  let prop = nameOf(tv.r1.proposerId);
  const song = (await (await fetch(base + '/api/search?q=a')).json()).results.slice(-1)[0];
  const pr = await act(prop, 'propose', { song }); if (pr.error) console.log('   propose:', pr.error, tv.r1 && tv.r1.step); await sleep(80);
  check(tv.r1.step === 'cue', 'Tras proponer, toca poner la canción en Spotify');
  check(states[prop].r1.spotify && /open\.spotify\.com\/track\//.test(states[prop].r1.spotify.url), 'Quien propone recibe el enlace de Spotify');
  check(!tv.r1.audio, 'La tele no reproduce audio en modo Spotify');
  const goodSp = 'https://open.spotify.com/track/' + 'A1b2C3d4E5f6G7h8I9j0Kk';
  check((await act(prop, 'spLink', { songId: song.id, url: 'https://evil.example/track/x' })).error, 'Se rechazan enlaces que no son de Spotify');
  await act(prop, 'spLink', { songId: song.id, url: goodSp + '?si=abc' }); await sleep(60);
  check(states[prop].r1.spotify.url === goodSp && states[prop].r1.spotify.found, 'El móvil puede aportar el enlace exacto si el servidor no lo encontró');
  const rivalName = Object.keys(P).find(n => states[n].me.groupId && states[n].me.groupId !== states[prop].me.groupId);
  check((await act(rivalName, 'buzz')).error, 'No se puede pulsar antes de que suene');
  check((await act(rivalName, 'cueStart')).error, 'Solo quien propone pone la canción');
  await act(prop, 'cueStart'); await sleep(60);
  check(tv.r1.step === 'playing' && tv.r1.playing, 'Al abrir Spotify empieza el tiempo');
  await act(rivalName, 'buzz'); await sleep(60);
  check(tv.r1.step === 'answering', 'Se puede pulsar mientras suena');
  await act(prop, 'judge', { verdict: 'title' }); await sleep(60);
  check(tv.deckSize === 1, 'La canción acertada entra al mazo');
  await sleep(T.REVEAL_HIT + 300);
  prop = nameOf(tv.r1.proposerId);
  const song2 = (await (await fetch(base + '/api/search?q=e')).json()).results.slice(-2)[0];
  await act(prop, 'propose', { song: song2 }); await sleep(60);
  T.CUE_MAX = 300; // si nunca la pone, el tiempo empieza solo
  tv.r1.step === 'cue' && await act(prop, 'cueStart');
  await sleep(T.PREVIEW + 300);
  if (tv.r1.reveal && tv.r1.reveal.pending) await act(prop, 'keep', { keep: true });
  await sleep(T.REVEAL_SHORT + 300);
  await act('Ana', 'endRound'); await sleep(60);
  await act('Ana', 'next'); await sleep(60); await act('Ana', 'beginRound'); await sleep(60);
  const clue = nameOf(tv.r24.clueGiverId);
  await act(clue, 'begin'); await sleep(80);
  const card = states[clue].r24.card;
  check(card && card.spotify && card.spotify.url && card.previewUrl === null, 'La carta de quien da pistas trae el enlace de Spotify y no el fragmento');
  stops.forEach(s => s());
  console.log(failures ? `\n${failures} comprobaciones fallidas` : '\nTodo OK');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
