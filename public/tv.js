(() => {
  const { esc, group, chip, dot, cover, ring, ROUNDS, ICON, fmt, connect, post, get } = HU;
  const $tv = document.getElementById('tv');
  const audio = new Audio();
  audio.preload = 'auto';
  window.__huAudio = audio; // para las pruebas automáticas
  HU.fadeOut(audio);
  let audioKey = null, retriedKey = null, songId = null;
  audio.addEventListener('error', async () => {
    if (!audioKey || retriedKey === audioKey || !songId) return;
    retriedKey = audioKey;
    const fresh = await HU.freshPreview(songId);
    if (fresh) { audio.src = fresh; if (S && S.r1 && S.r1.audio && S.r1.audio.playing) audio.play().catch(() => {}); }
  });
  let S = null;
  let joinUrl = location.origin;
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
    get('/api/info').then(r => { if (r.lan && r.lan.length) { joinUrl = r.lan[0]; if (S) render(S); } });
  }

  // Escalar el lienzo de 1280×720 a la pantalla
  function fit() {
    const k = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    document.getElementById('stage').style.transform = `translate(-50%, -50%) scale(${k})`;
  }
  window.addEventListener('resize', fit); fit();

  document.getElementById('unlockBtn').onclick = () => {
    try { const Ctx = window.AudioContext || window.webkitAudioContext; if (Ctx) new Ctx().resume(); } catch (e) {}
    audio.play().catch(() => {});
    document.getElementById('unlock').remove();
    if (S) syncAudio(S);
  };

  async function boot() {
    const params = new URLSearchParams(location.search);
    let code = (params.get('c') || '').toUpperCase();
    if (code) { const r = await get('/api/room?code=' + code); if (!r.exists) code = ''; }
    if (!code) {
      const r = await post('/api/rooms');
      if (!r.code) { $tv.innerHTML = '<div class="center"><h1>No se pudo crear la sala</h1><p class="mut">Recarga la página.</p></div>'; return; }
      code = r.code;
      history.replaceState(null, '', '/tv?c=' + code);
    }
    connect('/api/events?tv=1&room=' + code, s => { S = s; render(s); syncAudio(s); },
      ok => { document.getElementById('conn').textContent = ok ? '' : 'Reconectando…'; });
  }

  /* ---------------- Audio de la ronda 1 ---------------- */
  function syncAudio(s) {
    const a = s.phase === 'r1' && s.r1 && s.r1.audio;
    if (!a || !a.url) { if (!audio.paused) audio.pause(); audioKey = null; return; }
    const offset = (a.offsetMs + (Date.now() - s._recv)) / 1000;
    if (audioKey !== a.key) {
      audioKey = a.key;
      songId = a.songId;
      audio.src = a.url;
      audio.currentTime = 0;
    }
    if (a.playing) {
      if (audio.paused) {
        try { if (Math.abs(audio.currentTime - offset) > 0.6) audio.currentTime = offset; } catch (e) {}
        audio.play().catch(() => {});
      }
    } else if (!audio.paused) audio.pause();
  }

  /* ---------------- Piezas ---------------- */
  const roundPill = s => s.round ? `<span class="pill">Ronda ${s.round} · ${ROUNDS[s.round].name}</span>` : '';
  function header(s) {
    const inR24 = s.phase === 'r24' && s.r24;
    const label = inR24 ? 'Quedan' : 'Mazo';
    const val = inR24 ? s.r24.deckLeft : s.deckSize;
    const tot = inR24 ? s.deckSize : s.quota * s.groups.length;
    const deck = s.round >= 1 ? `<div style="display:flex;align-items:center;gap:14px">
      <span class="mut">${label}</span>
      <div class="bar" style="width:200px;height:10px"><i style="width:${Math.min(100, val / Math.max(1, tot) * 100)}%;background:var(--txt)"></i></div>
      <span class="display" style="font-weight:700;font-size:22px">${val} / ${tot}</span></div>` : '';
    return `<header class="top"><div style="display:flex;align-items:center;gap:20px"><div class="logo">Hit's <b>Up</b></div>${roundPill(s)}</div>${deck}</header>`;
  }
  function footer(s, opts = {}) {
    const showDeck = s.round === 1 && s.phase === 'r1';
    const showFichas = s.phase === 'r24';
    return `<footer class="score" style="grid-template-columns:repeat(${s.groups.length},minmax(0,1fr))">${s.groups.map(g => `
      <div class="sc">${dot(g.color, 12)}<div style="flex:1;min-width:0"><div style="font-weight:700">${esc(g.name)}</div>
      <div class="mut" style="font-size:13px">${showDeck ? `${g.inDeck} / ${s.quota} en el mazo` : showFichas ? `Fichas de falta: ${'●'.repeat(g.fichas)}${'○'.repeat(Math.max(0, 2 - g.fichas))}` : `${g.players.length} jugador${g.players.length === 1 ? '' : 'es'}`}</div></div>
      <div class="n">${g.score}</div></div>`).join('')}</footer>`;
  }
  const page = (s, body, withFooter = true) => header(s) + `<main class="body">${body}</main>` + (withFooter ? footer(s) : '');
  const eq = on => `<div class="eq ${on ? 'on' : ''}" aria-hidden="true">${Array.from({ length: 22 }, (_, i) => `<span style="animation-delay:${(i * 137 % 900) / 1000}s;height:${30 + (i * 53 % 70)}%;opacity:${0.5 + (i % 3) * 0.25}"></span>`).join('')}</div>`;

  /* ---------------- Pantallas ---------------- */
  function lobby(s) {
    const host = s.groups.flatMap(g => g.players).concat(s.unassigned).find(p => p.id === s.hostId);
    const url = joinUrl.replace(/^https?:\/\//, '');
    const link = joinUrl.replace(/\/$/, '') + '/?c=' + s.code;
    return header(s) + `<main class="body">
      <section class="card" style="flex:1;padding:32px 36px;display:flex;align-items:center;gap:36px">
        <div style="flex:none;display:flex;flex-direction:column;align-items:center;gap:12px">
          <img src="/api/qr.svg?text=${encodeURIComponent(link)}" width="280" height="280" alt="Código QR para entrar en la sala" style="display:block;border-radius:18px;background:#fff">
          <div style="font-weight:700;font-size:20px">Escanea para entrar</div>
        </div>
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:10px">
          <div class="mut" style="font-size:18px">O entra en</div>
          <div class="big" style="font-size:34px;word-break:break-all">${esc(url)}</div>
          <div class="mut" style="font-size:18px;margin-top:8px">con el código</div>
          <div class="big" style="font-size:112px;color:var(--acc);letter-spacing:0.06em">${esc(s.code)}</div>
          <div class="mut" style="font-size:16px">${host ? `${esc(host.name)} es quien empieza la partida desde su móvil.` : 'El primero en entrar será el anfitrión.'}</div>
        </div>
      </section>
      <section style="width:400px;display:flex;flex-direction:column;gap:14px">
        ${s.groups.map(g => `<div class="card" style="padding:18px 20px;border-radius:20px">
          <div style="display:flex;align-items:center;justify-content:space-between">${chip(g, 18)}<span class="mut">${g.players.length}</span></div>
          <div style="margin-top:10px;font-size:18px;line-height:1.5">${g.players.map(p => esc(p.name)).join(' · ') || '<span class="mut">Nadie todavía</span>'}</div></div>`).join('')}
        ${s.unassigned.length ? `<div class="mut" style="font-size:16px">Sin grupo: ${s.unassigned.map(p => esc(p.name)).join(', ')}</div>` : ''}
      </section></main>`;
  }
  function roundIntro(s) {
    const R = ROUNDS[s.round];
    return page(s, `<section class="card fade-in" style="flex:1;padding:24px 40px;display:flex;align-items:center;gap:44px">
      <div class="art" style="flex:none;width:420px">${HU_ART.art(s.round, 420)}</div>
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:12px">
        <div class="mut" style="font-size:16px;text-transform:uppercase;letter-spacing:.1em;font-weight:600">Ronda ${s.round}</div>
        <div class="big" style="font-size:64px">${R.name}</div>
        <div class="tv-rules">${HU_ART.rules(s.round, { iconSize: 26 })}</div>
        <div style="display:flex;flex-direction:column;gap:6px"><span class="pill" style="font-size:15px;align-self:flex-start">${esc(R.pts)}</span><span class="mut" style="font-size:14px">El anfitrión empieza la ronda desde su móvil.</span></div>
      </div></section>`);
  }
  function r1(s) {
    const r = s.r1, gp = group(s, r.groupId);
    if (r.step === 'choosing' || r.step === 'loading') {
      return page(s, `<section class="center card" style="padding:40px">
        <div style="display:flex;align-items:center;gap:14px;font-size:22px"><span class="mut" style="text-transform:uppercase;letter-spacing:.08em;font-weight:600;font-size:16px">Propone</span>${chip(gp, 22)}</div>
        <div class="big" style="font-size:84px">${esc(r.proposerName)}</div>
        <div class="mut" style="font-size:26px">${r.step === 'loading' ? 'Preparando la canción…' : 'está eligiendo canción…'}</div>
      </section>`);
    }
    if (r.step === 'reveal') {
      const rv = r.reveal, song = rv.song || {};
      const win = rv.winnerGroupId && group(s, rv.winnerGroupId);
      return page(s, `<section class="card fade-in" style="flex:1;padding:40px;display:flex;align-items:center;gap:44px">
        ${cover(song, 300, 24)}
        <div style="display:flex;flex-direction:column;gap:16px;min-width:0">
          <div class="big" style="font-size:72px">${esc(song.title)}</div>
          <div style="font-size:32px" class="mut">${esc(song.artist)}</div>
          ${rv.result === 'in'
            ? `<div style="display:flex;align-items:center;gap:14px;font-size:26px;flex-wrap:wrap"><span class="pill" style="background:#12261D;border-color:#1f4a35;color:#6FE3AE;font-size:22px">Entra al mazo</span>${chip(win, 22)}<b>+${rv.pts}</b><span class="mut">· ${esc(gp.name)} +1</span></div>`
            : `<div><span class="pill" style="font-size:22px">Nadie la acertó · se descarta</span></div>`}
        </div></section>`);
    }
    // Sonando o respondiendo
    const answering = r.step === 'answering';
    const ans = r.queue.find(q => q.answering);
    const ansG = ans && group(s, ans.groupId);
    const lv = r.lastVerdict && group(s, r.lastVerdict.groupId);
    const status = answering
      ? `<div class="warnpill" style="font-size:18px">${ICON.pause} Música en pausa · responde ${esc(ansG.name)}</div>`
      : lv ? `<div class="warnpill" style="font-size:18px">${esc(lv.name)}: ${r.lastVerdict.verdict === 'artist' ? 'solo el artista (+1)' : 'fallo (−1)'}</div>`
      : `<div class="mut" style="font-size:18px">Pulsad en el móvil si la sabéis</div>`;
    const queue = r.queue.length ? r.queue.map((q, i) => {
      const g = group(s, q.groupId);
      return `<div class="q-item ${q.answering ? 'on' : ''}">
        <div class="display" style="font-weight:700;font-size:22px;width:22px;${q.answering ? '' : 'color:var(--mut)'}">${i + 1}</div>${dot(g.color, 14)}
        <div style="flex:1;min-width:0"><div style="font-weight:700;font-size:20px">${esc(g.name)}</div>${q.answering ? '<div style="font-size:14px;color:#FFB3C2">Respondiendo</div>' : ''}</div>
        ${q.answering ? (r.answeringExpired ? '<div class="pill" style="font-size:14px;white-space:nowrap">Decide el juez</div>' : ring(56, 5, r.answeringDeadline, s.T.ANSWER)) : `<div class="mut" style="font-size:16px">${i === 0 ? '' : '+' + (q.delta / 1000).toFixed(2).replace('.', ',') + ' s'}</div>`}</div>`;
    }).join('') : '<div class="mut" style="font-size:18px">Nadie ha pulsado todavía.</div>';
    const outTxt = r.out.length ? `<div class="mut" style="font-size:14px">Fuera: ${r.out.map(id => esc(group(s, id).name)).join(', ')}</div>` : '';
    const bonusPct = s.T.BONUS / s.T.PREVIEW * 100;
    return page(s, `
      <section class="card" style="flex:1;min-width:0;padding:30px 36px;display:flex;flex-direction:column;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:12px;font-size:16px"><span class="mut" style="text-transform:uppercase;letter-spacing:.08em;font-weight:600;font-size:13px">Propone</span>${chip(gp)}<span class="mut">· ${esc(r.proposerName)}</span></div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:18px">${eq(r.playing)}<div class="big" style="font-size:60px">¿Qué canción es?</div>${status}</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div class="bar"><i data-played="${r.playedMs}" data-recv="${s._recv}" data-playing="${r.playing ? 1 : 0}" data-total="${s.T.PREVIEW}" data-kind="bar" style="width:${r.playedMs / s.T.PREVIEW * 100}%"></i>
            <span style="position:absolute;left:${bonusPct}%;top:0;bottom:0;width:2px;background:var(--txt);opacity:.6"></span></div>
          <div style="display:flex;justify-content:space-between;font-size:15px" class="mut"><span><b style="color:var(--txt)" data-played="${r.playedMs}" data-recv="${s._recv}" data-playing="${r.playing ? 1 : 0}" data-total="${s.T.PREVIEW}">${fmt(r.playedMs - 999)}</b> / ${fmt(s.T.PREVIEW)}</span><span>Hasta ${fmt(s.T.BONUS)} · +1 por rapidez</span></div>
        </div>
      </section>
      <aside class="card" style="width:380px;flex:none;padding:26px;display:flex;flex-direction:column;gap:12px">
        <div class="display" style="font-weight:700;font-size:24px">Cola</div>${queue}
        <div style="margin-top:auto;display:flex;flex-direction:column;gap:6px">${outTxt}<div class="mut" style="font-size:14px">${esc(gp.name)} no puede pulsar: la canción es suya.</div></div>
      </aside>`);
  }
  function r24(s) {
    const r = s.r24, g = group(s, r.groupId), R = ROUNDS[s.round];
    if (r.step === 'ready') {
      return page(s, `<section class="card fade-in" style="flex:1;padding:28px 40px;display:flex;align-items:center;gap:44px">
        <div class="art" style="flex:none;width:360px">${HU_ART.art(s.round, 360)}</div>
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:16px">
          <div style="display:flex;align-items:center;gap:14px;font-size:22px"><span class="mut" style="text-transform:uppercase;letter-spacing:.08em;font-weight:600;font-size:16px">Turno de</span>${chip(g, 24)}</div>
          <div class="big" style="font-size:68px">Da pistas ${esc(r.clueGiverName)}</div>
          <div class="mut" style="font-size:20px">Que se ponga los auriculares y pulse Empezar.</div>
          <div class="tv-rules">${HU_ART.rules(s.round, { iconSize: 26 })}</div>
        </div></section>`);
    }
    if (r.step === 'turnEnd') {
      const sm = r.summary;
      return page(s, `<section class="center card" style="padding:40px">
        <div class="mut" style="font-size:22px">Fin del turno</div>${chip(group(s, sm.groupId), 26)}
        <div class="big" style="font-size:96px">${sm.hits} carta${sm.hits === 1 ? '' : 's'}</div>
        <div style="font-size:28px">+${sm.pts} puntos · quedan ${r.deckLeft} en el mazo</div></section>`);
    }
    if (r.step === 'falta') {
      const f = r.falta, cg = group(s, f.claimGroupId), ag = group(s, f.accusedGroupId);
      const st = [
        `${esc(ag.name)}: ${f.accused === 'deny' ? 'dicen que no hubo falta' : 'pensando…'}`,
        `${esc(cg.name)}: ${f.claim === 'insist' ? 'mantienen la falta' : 'pensando…'}`
      ].concat(f.neutralIds.map(id => `${esc(group(s, id).name)}: ${f.votes[id] ? (f.votes[id] === 'mala' ? 'votan falta' : 'votan que no') : 'votando…'}`));
      return page(s, `<section class="card fade-in" style="flex:1;padding:36px 40px;display:flex;gap:40px;align-items:center">
        <div style="flex:1;display:flex;flex-direction:column;gap:18px">
          <div class="big" style="font-size:96px;color:var(--acc)">¡Falta!</div>
          <div style="display:flex;align-items:center;gap:12px;font-size:22px;flex-wrap:wrap">${chip(cg, 20)}<span class="mut">reclama a</span>${chip(ag, 20)}</div>
          <div style="font-size:20px;line-height:1.7">${st.join('<br>')}</div>
          <div class="mut" style="font-size:16px">Si no hay acuerdo en <b data-until="${f.deadline}" data-fmt="sec"></b> s, la carta se anula.</div>
        </div>
        <div style="width:380px;display:flex;flex-direction:column;gap:14px;align-items:center;text-align:center">${cover(f.song, 220, 20)}
          <div class="big" style="font-size:40px">${esc(f.song.title)}</div><div class="mut" style="font-size:22px">${esc(f.song.artist)}</div>
          <div class="mut" style="font-size:15px">${f.target === 'hit' ? 'Carta recién acertada' : 'Carta en juego'}</div></div>
      </section>`);
    }
    const fr = r.faltaResult;
    const frTxt = fr ? `<div class="warnpill" style="font-size:18px">Falta resuelta: ${fr.decision === 'mala' ? 'era falta, la carta no cuenta' : fr.decision === 'buena' ? 'no era falta' : 'sin acuerdo, carta anulada'}</div>` : '';
    return page(s, `<section class="card" style="flex:1;padding:36px 40px;display:flex;flex-direction:column;justify-content:space-between">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:14px;font-size:20px">${chip(g, 20)}<span class="mut">da pistas</span><b>${esc(r.clueGiverName)}</b></div>${frTxt}</div>
        <div style="display:flex;align-items:center;justify-content:center;gap:60px">
          <div class="big" style="font-size:190px" data-until="${r.deadline}">${fmt(r.deadline - HU.sNow())}</div>
          <div style="display:flex;flex-direction:column;gap:14px;font-size:28px">
            <div><span class="big" style="font-size:64px">${r.hits}</span> <span class="mut">aciertos</span></div>
            <div><span class="big" style="font-size:40px">${r.deckLeft}</span> <span class="mut">cartas en el mazo</span></div></div></div>
        <div class="bar" style="height:14px"><i data-bar-until="${r.deadline}" data-total="${r.turnMs}" style="width:100%"></i></div>
      </section>`);
  }
  function standings(s, final) {
    const sorted = s.groups.slice().sort((a, b) => b.score - a.score);
    const max = Math.max(1, ...sorted.map(g => g.score));
    const next = !final && ROUNDS[s.round + 1];
    return header(s) + `<main class="body"><section class="card" style="flex:1;padding:36px 44px;display:flex;flex-direction:column;gap:20px">
      <div class="big" style="font-size:${final ? 72 : 52}px">${final ? `¡Gana ${esc(sorted[0].name)}!` : `Clasificación tras la ronda ${s.round}`}</div>
      <div style="display:flex;flex-direction:column;gap:14px;flex:1;justify-content:center">${sorted.map((g, i) => `
        <div style="display:flex;align-items:center;gap:18px">
          <div class="big" style="font-size:40px;width:40px;color:${i === 0 ? 'var(--acc)' : 'var(--mut)'}">${i + 1}</div>
          <div style="width:220px">${chip(g, 22)}</div>
          <div class="bar" style="flex:1;height:22px"><i style="width:${Math.max(2, g.score / max * 100)}%;background:${g.color}"></i></div>
          <div class="big" style="font-size:44px;width:110px;text-align:right">${g.score}</div></div>`).join('')}</div>
      <div class="mut" style="font-size:18px">${final ? 'El anfitrión puede empezar otra partida desde su móvil.' : `Siguiente: ronda ${s.round + 1} · ${next.name}. El anfitrión continúa desde su móvil.`}</div>
    </section></main>`;
  }

  function render(s) {
    let html;
    switch (s.phase) {
      case 'lobby': html = lobby(s); break;
      case 'roundIntro': html = roundIntro(s); break;
      case 'r1': html = s.r1 ? r1(s) : ''; break;
      case 'r24': html = s.r24 ? r24(s) : ''; break;
      case 'standings': html = standings(s, false); break;
      case 'final': html = standings(s, true); break;
      default: html = '';
    }
    $tv.innerHTML = html;
  }

  boot();
})();
