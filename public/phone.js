(() => {
  const { esc, group, chip, dot, cover, ring, ROUNDS, ICON, fmt, connect, post, get, toast } = HU;
  const $ = id => document.getElementById(id);
  const $main = $('main'), $panel = $('panel');
  $('searchIcon').innerHTML = ICON.search;
  $('muteIcon').innerHTML = ICON.mute;

  const params = new URLSearchParams(location.search);
  let code = (params.get('c') || '').toUpperCase();
  let pid = code ? localStorage.getItem('hu_pid_' + code) : null;
  let S = null, stopConn = null, lastHtml = '', busy = false, errCount = 0;
  let prepTab = 'partida'; // pestañas de la sala: 'partida' | 'canciones'
  let editingName = false, focusName = false;

  /* ---------------- Audio ---------------- */
  const audio = new Audio();
  let playingKey = null, cardDrawId = null;
  const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
  let unlocked = false;
  function unlockAudio() {
    if (unlocked) return;
    unlocked = true;
    try { audio.src = SILENT; const p = audio.play(); if (p) p.catch(() => {}); } catch (e) {}
  }
  document.addEventListener('pointerdown', unlockAudio, { once: true });
  function stopAudio() { try { audio.pause(); } catch (e) {} playingKey = null; refreshPlayButtons(); }
  async function playSong(key, song) {
    if (playingKey === key) return stopAudio();
    let url = song.preview || song.previewUrl;
    const fresh = await HU.freshPreview(song.id);
    if (fresh) url = fresh;
    if (!url) return toast('Esta canción no tiene fragmento', true);
    audio.src = url;
    audio.play().catch(() => toast('No se pudo reproducir', true));
    playingKey = key;
    refreshPlayButtons();
  }
  audio.addEventListener('ended', () => { if (playingKey && !playingKey.startsWith('card')) { playingKey = null; refreshPlayButtons(); } });
  audio.addEventListener('error', async () => {
    if (!playingKey || !playingKey.startsWith('card') || !S || !S.r24 || !S.r24.card) return;
    if (audio.dataset.retried === S.r24.card.drawId) return;
    audio.dataset.retried = S.r24.card.drawId;
    const fresh = await HU.freshPreview(S.r24.card.id);
    if (fresh && fresh !== audio.src) { audio.src = fresh; audio.play().catch(() => {}); }
  });
  function refreshPlayButtons() {
    document.querySelectorAll('[data-pact="play"]').forEach(b => { b.innerHTML = b.dataset.key === playingKey ? ICON.stop : ICON.play; });
  }

  async function act(type, extra) {
    if (busy) return {};
    busy = true;
    const r = await post('/api/action', { room: code, pid, type, ...(extra || {}) });
    busy = false;
    if (r.error) toast(r.error, true);
    return r;
  }

  /* ---------------- Entrar ---------------- */
  function showJoin(err) {
    if (stopConn) { stopConn(); stopConn = null; }
    $panel.hidden = true;
    lastHtml = '';
    $main.innerHTML = `<div style="display:flex;flex-direction:column;gap:18px;padding-top:30px">
      <div class="display" style="font-weight:700;font-size:44px">Hit's <span style="color:var(--acc)">Up</span></div>
      <div class="mut">Mira el código en la TV y escribe tu nombre.</div>
      ${err ? `<div class="warn">${esc(err)}</div>` : ''}
      <form id="joinForm" style="display:flex;flex-direction:column;gap:14px">
        <div class="field"><label for="jcode">Código de la sala</label><input class="input" id="jcode" maxlength="4" autocomplete="off" autocapitalize="characters" style="text-transform:uppercase;letter-spacing:.2em;font-weight:700" value="${esc(code)}"></div>
        <div class="field"><label for="jname">Tu nombre</label><input class="input" id="jname" maxlength="20" autocomplete="nickname" value="${esc(localStorage.getItem('hu_name') || '')}"></div>
        <button class="btn btn-acc btn-block" type="submit">Entrar</button>
      </form></div>`;
    $('joinForm').onsubmit = async e => {
      e.preventDefault();
      unlockAudio();
      const c = $('jcode').value.trim().toUpperCase(), name = $('jname').value.trim();
      if (c.length !== 4) return toast('El código tiene 4 letras', true);
      if (!name) return toast('Escribe tu nombre', true);
      localStorage.setItem('hu_name', name);
      code = c;
      pid = localStorage.getItem('hu_pid_' + code);
      const r = await post('/api/join', { room: code, name, pid });
      if (r.error) return showJoin(r.error);
      pid = r.pid;
      localStorage.setItem('hu_pid_' + code, pid);
      history.replaceState(null, '', '/?c=' + code);
      startConn();
    };
  }
  async function boot() {
    if (!code || !pid) return showJoin();
    const r = await post('/api/join', { room: code, pid, name: localStorage.getItem('hu_name') || '' });
    if (r.error) return showJoin(r.error === 'No existe esa sala' ? 'Esa sala ya no existe. Mira el código nuevo en la TV.' : r.error);
    pid = r.pid;
    localStorage.setItem('hu_pid_' + code, pid);
    startConn();
  }
  function startConn() {
    if (stopConn) stopConn();
    stopConn = connect(`/api/events?room=${code}&pid=${pid}`, s => { errCount = 0; render(s); }, ok => {
      if (ok) return;
      if (++errCount >= 3) { errCount = 0; boot(); }
    });
  }

  /* ---------------- Piezas ---------------- */
  const myGroup = s => s.me.groupId && group(s, s.me.groupId);
  const kicker = (g, txt) => `<div class="kicker">${g ? dot(g.color, 9) : ''}${esc(txt)}</div>`;
  const timerPill = until => `<div class="pill display" style="font-weight:700;font-size:18px;border:2px solid var(--acc)" data-until="${until}">${fmt(until - HU.sNow())}</div>`;
  const hostBar = btns => S.me.isHost && btns.length ? `<div class="host"><div class="mut" style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;font-weight:600">Anfitrión</div><div class="row">${btns.join('')}</div></div>` : '';
  const hbtn = (act, label) => `<button type="button" class="sm-btn btn-sec" data-act="${act}">${label}</button>`;
  const VALE = {
    2: ['Contexto, época, de qué trata, a qué recuerda', 'Título, artista, cantar o tararear'],
    3: ['Tararear, silbar, gestos moderados', 'Letra, palabras, bailar'],
    4: ['Bailar y mímica', 'Sonidos, mover los labios con la letra']
  };
  const rulesBox = round => {
    const R = HU_ART.RULES[round];
    const col = (cls, title, list, color) => `<div style="padding:12px;border-radius:14px;background:${cls === 'ok' ? '#12261D' : '#2A1517'}">
      <div style="font-weight:700;color:${color};margin-bottom:6px">${title}</div>
      ${list.map(([k, t]) => `<div style="display:flex;gap:8px;align-items:flex-start;margin-top:6px;color:${cls === 'ok' ? '#D6F5E6' : '#F8D6D6'}"><span style="color:${color};flex:none;margin-top:1px">${HU_ART.icon(k, 16)}</span><span>${esc(t)}</span></div>`).join('')}</div>`;
    return `<div class="rules" style="font-size:13px;line-height:1.35">${col('ok', 'Vale', R.ok, '#6FE3AE')}${col('no', 'No vale', R.no, '#FF9A9A')}</div>`;
  };
  const scoreLine = s => { const g = myGroup(s); return g ? `${g.score} pts` : ''; };

  /* ---------------- Pantallas ---------------- */
  function lobby(s) {
    const me = s.me;
    const members = g => `<div class="mut" style="font-size:13px">${g.players.map(p => esc(p.name)).join(', ') || 'Nadie todavía'}</div>`;
    const groups = s.groups.map(g => {
      if (g.id !== me.groupId) return `<button type="button" class="gbtn" data-act="joinGroup" data-arg="${g.id}">
        ${dot(g.color, 16)}<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:17px">${esc(g.name)}</div>${members(g)}</div></button>`;
      if (editingName) return `<form class="gbtn on" id="gform" style="flex-direction:column;align-items:stretch;gap:10px" autocomplete="off">
        <label for="gname" style="display:flex;align-items:center;gap:10px;font-size:13px" class="mut">${dot(g.color, 12)}Nombre de vuestro grupo</label>
        <input id="gname" class="input" maxlength="18" value="${esc(g.name)}" enterkeyhint="done">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button type="button" class="btn btn-sec" data-act="cancelName">Cancelar</button>
          <button type="submit" class="btn btn-acc">Guardar</button></div></form>`;
      return `<div class="gbtn on">${dot(g.color, 16)}<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:17px;overflow-wrap:anywhere">${esc(g.name)}</div>${members(g)}</div>
        <button type="button" class="icon-btn" data-act="editName" aria-label="Cambiar el nombre del grupo">${ICON.edit}</button></div>`;
    }).join('');
    const host = me.isHost ? `<div class="host"><div class="mut" style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;font-weight:600">Eres el anfitrión</div>
        <div class="field"><label>Número de grupos</label><div class="seg">${[2, 3, 4, 5].map(n => `<button type="button" class="${s.groups.length === n ? 'on' : ''}" data-act="setGroups" data-arg="${n}">${n}</button>`).join('')}</div></div>
        <button type="button" class="btn btn-acc btn-block" data-act="start">Empezar partida</button>
        <div class="mut" style="font-size:13px">Hacen falta al menos 2 grupos con jugadores. Los grupos vacíos se quitan al empezar.</div></div>`
      : `<div class="mut" style="font-size:14px">Cuando estéis todos, el anfitrión empezará la partida.</div>`;
    return `${kicker(null, 'Sala ' + s.code)}<div class="title">Hola, ${esc(me.name)}</div>
      <div style="font-weight:600">${me.groupId ? 'Tu grupo' : 'Elige tu grupo'}</div>
      <div style="display:flex;flex-direction:column;gap:8px">${groups}</div>${host}`;
  }
  function roundIntro(s) {
    const R = ROUNDS[s.round];
    return `${kicker(myGroup(s), 'Ronda ' + s.round)}<div class="title" style="font-size:36px">${R.name}</div>
      <div class="art">${HU_ART.art(s.round, 240)}</div>
      ${HU_ART.rules(s.round)}
      <div class="pill" style="font-size:14px;line-height:1.4">${esc(R.pts)}</div>
      ${s.me.isHost ? `<button type="button" class="btn btn-acc btn-block" data-act="beginRound">Empezar ronda ${s.round}</button>` : '<div class="mut">Esperando al anfitrión…</div>'}`;
  }

  function r1(s) {
    const r = s.r1, me = s.me, gp = group(s, r.groupId), mg = myGroup(s);
    const isProp = me.id === r.proposerId, mine = me.groupId === r.groupId;
    const hb = hostBar([r.step === 'choosing' ? hbtn('skipTurn', 'Pasar turno') : '', hbtn('endRound', 'Terminar ronda')].filter(Boolean));
    if (r.step === 'choosing') {
      if (isProp) return `<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px"><div>${kicker(gp, gp.name + ' · Ronda 1')}<div class="title">Te toca, ${esc(me.name)}</div></div>${timerPill(r.chooseDeadline)}</div>
        <div class="mut" style="font-size:14px">Elige una canción de tu lista o búscala. Gana tu grupo si los rivales la aciertan.</div>${hb}`;
      return `${kicker(mg, (mg ? mg.name : 'Sin grupo') + ' · Ronda 1 · ' + scoreLine(s))}
        <div class="card" style="padding:22px;display:flex;flex-direction:column;gap:10px;align-items:flex-start">${chip(gp)}
        <div class="title" style="font-size:24px">${esc(r.proposerName)} está eligiendo canción</div>
        <div class="mut" style="font-size:14px">${mine ? 'Es vuestro turno: no podréis pulsar en esta canción.' : 'Prepárate para pulsar en cuanto la reconozcas.'}</div></div>${hb}`;
    }
    if (r.step === 'loading') return `<div class="grow center"><div class="title">Preparando la canción…</div></div>`;
    if (r.step === 'reveal') {
      const rv = r.reveal, song = rv.song || {}, win = rv.winnerGroupId && group(s, rv.winnerGroupId);
      return `<div class="grow center fade-in">${cover(song, 160, 20)}<div class="title" style="font-size:30px">${esc(song.title)}</div><div class="mut">${esc(song.artist)}</div>
        ${rv.result === 'in' ? `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:center">${chip(win)}<b>+${rv.pts}</b><span class="mut">· entra al mazo</span></div>` : '<div class="pill">Nadie la acertó · se descarta</div>'}</div>${hb}`;
    }
    // Sonando o respondiendo
    const ans = r.queue.find(q => q.answering), ansG = ans && group(s, ans.groupId);
    if (isProp) {
      const lv = r.lastVerdict && group(s, r.lastVerdict.groupId);
      const next = r.queue.filter(q => !q.answering).map(q => esc(group(s, q.groupId).name));
      const can = r.step === 'answering';
      const bonus = r.playedMs < s.T.BONUS;
      return `<div>${kicker(gp, gp.name + ' · Ronda 1 · Tu canción')}<div class="title">Eres el juez</div></div>
        <div class="card" style="display:flex;align-items:center;gap:14px;padding:14px;border-radius:18px">${cover(r.song, 64)}
          <div class="s-meta"><div class="display" style="font-weight:700;font-size:22px">${esc(r.song.title)}</div><div class="mut" style="font-size:14px">${esc(r.song.artist)}</div><div class="mut" style="font-size:12px;margin-top:4px">Solo tú ves la respuesta</div></div></div>
        <div class="grow center" style="gap:12px">
          ${can ? `<div class="mut" style="font-size:13px;text-transform:uppercase;letter-spacing:.08em;font-weight:600">Responde</div>${chip(ansG, 22)}${r.answeringExpired
              ? '<div class="title" style="font-size:26px">¿Ha acertado?</div><div class="mut" style="font-size:14px;max-width:280px">Se acabaron los 5 s para empezar a responder. Escucha la respuesta y decide.</div>'
              : ring(140, 10, r.answeringDeadline, s.T.ANSWER)}
            <div class="mut" style="font-size:14px">${next.length ? 'Después: ' + next.join(' · ') : 'Nadie más en la cola'}</div>`
            : `<div class="title" style="font-size:22px">Esperando a que alguien pulse…</div>${lv ? `<div class="mut">${esc(lv.name)}: ${r.lastVerdict.verdict === 'artist' ? 'solo artista' : 'fallo'}</div>` : ''}`}
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <button type="button" class="btn btn-ok" style="min-height:64px;justify-content:space-between" data-act="judge" data-arg="title" ${can ? '' : 'disabled'}><span style="display:inline-flex;gap:10px;align-items:center">${ICON.check}Título correcto</span><span style="font:600 14px Inter">+${bonus ? 3 : 2} · entra al mazo</span></button>
          <button type="button" class="btn btn-sec" style="justify-content:space-between" data-act="judge" data-arg="artist" ${can ? '' : 'disabled'}><span>Solo artista</span><span class="mut" style="font:500 14px Inter">+1 · sigue la cola</span></button>
          <button type="button" class="btn btn-ko" style="justify-content:space-between" data-act="judge" data-arg="fail" ${can ? '' : 'disabled'}><span style="display:inline-flex;gap:10px;align-items:center">${ICON.x}Fallo</span><span style="font:500 14px Inter">−1 · siguiente</span></button>
        </div>${hb}`;
    }
    if (mine) {
      return `${kicker(mg, mg.name + ' · Ronda 1 · ' + scoreLine(s))}<div class="grow center">
        <div class="title">Suena vuestra canción</div><div class="mut">No podéis pulsar. ${ansG ? 'Responde ' + esc(ansG.name) + '.' : 'Esperando a los rivales…'}</div></div>${hb}`;
    }
    // Pulsador
    const idx = r.queue.findIndex(q => q.groupId === me.groupId);
    const out = r.out.includes(me.groupId);
    const ended = !r.playing && r.step === 'playing' && r.playedMs >= s.T.PREVIEW;
    let st = 'libre';
    if (idx >= 0 && r.queue[idx].answering) st = 'responde';
    else if (idx >= 0) st = 'cola';
    else if (out) st = 'out';
    else if (ended) st = 'fin';
    const styles = {
      libre: 'background:var(--acc);color:var(--acc-ink);box-shadow:0 0 0 14px rgba(255,90,122,.16),0 0 0 28px rgba(255,90,122,.07)',
      cola: 'background:#1B1E28;color:var(--txt);border:4px solid var(--acc)',
      responde: 'background:var(--ok);color:var(--ok-ink);box-shadow:0 0 0 14px rgba(62,207,142,.18)',
      out: 'background:#14161D;color:var(--mut);border:2px dashed var(--line2)',
      fin: 'background:#14161D;color:var(--mut);border:2px solid var(--line)'
    };
    const inner = {
      libre: '<span class="display" style="font-weight:700;font-size:44px">¡LA SÉ!</span>',
      cola: `<span style="display:flex;flex-direction:column;align-items:center"><span style="font-size:16px;font-weight:600" class="mut">En cola</span><span class="display" style="font-weight:700;font-size:72px;line-height:1">${idx + 1}º</span></span>`,
      responde: r.answeringExpired
        ? '<span style="display:flex;flex-direction:column;align-items:center;gap:6px"><span style="font-size:16px;font-weight:700">¡Os toca!</span><span class="display" style="font-weight:700;font-size:26px;line-height:1.15">Decide el juez</span></span>'
        : `<span style="display:flex;flex-direction:column;align-items:center"><span style="font-size:16px;font-weight:700">¡Os toca!</span><span class="display" style="font-weight:700;font-size:80px;line-height:1" data-until="${r.answeringDeadline}" data-fmt="sec">5</span></span>`,
      out: '<span class="display" style="font-weight:700;font-size:26px">Fuera en esta canción</span>',
      fin: '<span class="display" style="font-weight:700;font-size:26px">Se acabó la canción</span>'
    };
    const help = {
      libre: 'Pulsa si sabes el título. Si fallas, −1.',
      cola: ansG ? `Responde ${esc(ansG.name)}. Estáis en la cola.` : 'Estáis en la cola.',
      responde: r.answeringExpired ? 'Terminad de responder: el juez dirá si vale.' : 'Decid el título en voz alta. La música está en pausa.',
      out: 'Esperad a la siguiente canción.',
      fin: 'Esperad a que se resuelva la cola.'
    };
    return `<div style="display:flex;align-items:center;justify-content:space-between">${chip(mg)}<span class="mut" style="font-size:13px">Ronda 1 · ${scoreLine(s)}</span></div>
      <div style="text-align:center"><div class="mut" style="font-size:14px">Canción de ${esc(gp.name)}</div></div>
      <div class="grow center" style="gap:22px">
        <button type="button" class="buzz" style="${styles[st]}" data-act="buzz" ${st === 'libre' ? '' : 'disabled'} aria-label="Pulsador">${inner[st]}</button>
        <div style="max-width:280px;font-size:15px;line-height:1.45">${help[st]}</div></div>
      <div class="card" style="display:flex;justify-content:space-between;padding:14px 16px;border-radius:16px;font-size:14px">
        <span class="mut">Mazo <b style="color:var(--txt)">${s.deckSize} / ${s.quota * s.groups.length}</b></span><span class="mut">Vuestras: <b style="color:var(--txt)">${mg.inDeck} / ${s.quota}</b></span></div>${hb}`;
  }

  function r24(s) {
    const r = s.r24, me = s.me, g = group(s, r.groupId), mg = myGroup(s), R = ROUNDS[s.round];
    const isClue = me.id === r.clueGiverId, mine = me.groupId === r.groupId;
    const pts = { 2: 2, 3: 3, 4: 4 }[s.round];
    const hb = hostBar([r.step === 'ready' ? hbtn('skipTurn', 'Pasar turno') : '', hbtn('endRound', 'Terminar ronda')].filter(Boolean));
    if (r.step === 'ready') {
      if (isClue) return `<div>${kicker(g, g.name + ' · Ronda ' + s.round + ' · ' + R.name)}<div class="title">Te toca dar pistas</div></div>
        <div class="warn" style="font-size:15px">${ICON.headphones}<span>Ponte los auriculares: la canción solo debe oírla tú.</span></div>
        <div class="art">${HU_ART.art(s.round, 200)}</div>
        ${HU_ART.rules(s.round)}
        <div class="grow"></div><button type="button" class="btn btn-acc btn-block" style="min-height:64px;font-size:20px" data-act="begin">Empezar</button>${hb}`;
      return `${kicker(mg, (mg ? mg.name : '') + ' · Ronda ' + s.round + ' · ' + scoreLine(s))}<div class="grow center"><div class="art">${HU_ART.art(s.round, 200)}</div>${chip(g, 18)}
        <div class="title">Da pistas ${esc(r.clueGiverName)}</div><div class="mut">${mine ? '¡Preparaos para adivinar!' : 'Vigilaréis la carta desde aquí.'}</div></div>${hb}`;
    }
    if (r.step === 'turnEnd') {
      const sm = r.summary;
      return `<div class="grow center">${chip(group(s, sm.groupId), 18)}<div class="title" style="font-size:40px">${sm.hits} carta${sm.hits === 1 ? '' : 's'}</div><div class="mut">+${sm.pts} puntos · quedan ${r.deckLeft} en el mazo</div></div>${hb}`;
    }
    if (r.step === 'falta') {
      const f = r.falta, cg = group(s, f.claimGroupId), ag = group(s, f.accusedGroupId);
      let actions = '';
      if (me.groupId === f.accusedGroupId) {
        if (!isClue) actions = `<div class="mut">${esc(r.clueGiverName)} responde por vuestro grupo.</div>`;
        else if (f.accused === 'deny') actions = '<div class="mut">Has dicho que no hubo falta. Esperando…</div>';
        else actions = `<button type="button" class="btn btn-sec btn-block" data-act="faltaChoice" data-arg="admit">Lo reconozco</button><button type="button" class="btn btn-acc btn-block" data-act="faltaChoice" data-arg="deny">No hubo falta</button>`;
      } else if (me.groupId === f.claimGroupId) {
        actions = f.claim === 'insist' ? '<div class="mut">Mantenéis la falta. Esperando…</div>'
          : `<button type="button" class="btn btn-sec btn-block" data-act="faltaChoice" data-arg="retire">Retiro la falta</button><button type="button" class="btn btn-acc btn-block" data-act="faltaChoice" data-arg="insist">Mantengo la falta</button>`;
      } else {
        const v = f.votes[me.groupId];
        actions = `<div class="mut" style="font-size:14px">Vuestro grupo decide: ¿hubo falta?</div>
          <button type="button" class="btn ${v === 'mala' ? 'btn-acc' : 'btn-sec'} btn-block" data-act="faltaChoice" data-arg="mala">Sí, es falta</button>
          <button type="button" class="btn ${v === 'buena' ? 'btn-acc' : 'btn-sec'} btn-block" data-act="faltaChoice" data-arg="buena">No es falta</button>`;
      }
      return `<div class="title" style="color:var(--acc);font-size:40px">¡Falta!</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">${chip(cg)}<span class="mut">reclama a</span>${chip(ag)}</div>
        <div class="card" style="display:flex;align-items:center;gap:14px;padding:14px;border-radius:18px">${cover(f.song, 64)}<div class="s-meta"><div class="display" style="font-weight:700;font-size:22px">${esc(f.song.title)}</div><div class="mut">${esc(f.song.artist)}</div></div></div>
        <div class="mut" style="font-size:14px">Sin acuerdo en <b data-until="${f.deadline}" data-fmt="sec"></b> s, la carta se anula.</div>
        <div class="grow" style="justify-content:flex-end;gap:10px">${actions}</div>`;
    }
    // Turno en juego
    const top = `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><div>${kicker(g, g.name + ' · da pistas ' + r.clueGiverName)}<div class="title" style="font-size:24px">Ronda ${s.round} · ${R.name}</div></div>
      <div class="display" style="font-weight:700;font-size:34px;color:var(--acc)" data-until="${r.deadline}">${fmt(r.deadline - HU.sNow())}</div></div>
      <div class="bar" style="height:6px"><i data-bar-until="${r.deadline}" data-total="${r.turnMs}" style="width:100%"></i></div>`;
    const fr = r.faltaResult ? `<div class="warn">Falta resuelta: ${r.faltaResult.decision === 'mala' ? 'era falta' : r.faltaResult.decision === 'buena' ? 'no era falta' : 'sin acuerdo, carta anulada'}</div>` : '';
    if (isClue && r.card) {
      const c = r.card;
      return `${top}${fr}<section class="card" style="flex:1;border-radius:28px;padding:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center">
          ${cover(c, 132, 20)}<div class="display" style="font-weight:700;font-size:34px;line-height:1.05">${esc(c.title)}</div><div class="mut" style="font-size:17px">${esc(c.artist)}</div>
          <button type="button" class="btn btn-sec" style="min-height:44px;border-radius:999px;font:600 15px Inter" data-act="replay">${ICON.repeat} Repetir fragmento</button>
          <div class="mut" style="font-size:13px;display:inline-flex;gap:6px;align-items:center">${ICON.headphones} Suena en tus auriculares</div></section>
        ${rulesBox(s.round)}
        <div style="display:flex;justify-content:space-between;font-size:14px" class="mut"><span>Aciertos en este turno: <b style="color:var(--txt)">${r.hits}</b></span><span>Quedan <b style="color:var(--txt)">${r.deckLeft}</b></span></div>
        <div style="display:grid;grid-template-columns:1fr 1.6fr;gap:10px"><button type="button" class="btn btn-sec" style="min-height:60px" data-act="pass">Pasar</button><button type="button" class="btn btn-acc" style="min-height:60px;font-size:18px" data-act="hit">¡Acertada! +${pts}</button></div>`;
    }
    if (mine) {
      return `${top}${fr}<div class="grow center"><div class="title" style="font-size:44px">¡Adivinad!</div><div class="mut" style="font-size:17px">${esc(r.clueGiverName)} da las pistas. Decid el título en voz alta.</div>
        <div><span class="display" style="font-weight:700;font-size:56px">${r.hits}</span> <span class="mut">aciertos</span></div></div>`;
    }
    const c = r.card;
    const fichas = mg ? mg.fichas : 0;
    return `${top}${fr}
      ${c ? `<section class="card" style="display:flex;align-items:center;gap:14px;padding:16px;border-radius:20px">${cover(c, 72, 14)}<div class="s-meta"><div class="display" style="font-weight:700;font-size:26px">${esc(c.title)}</div><div class="mut" style="font-size:15px">${esc(c.artist)}</div></div></section>` : '<div class="mut">Cambiando de carta…</div>'}
      <div style="display:flex;flex-direction:column;gap:8px"><div style="font-weight:700;color:#FF9A9A">Es falta si…</div>${HU_ART.rules(s.round, { only: 'no' })}</div>
      <div class="grow" style="justify-content:flex-end;gap:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;font-size:15px"><span>Fichas de falta en esta ronda</span><span style="display:inline-flex;gap:8px">${[0, 1].map(i => `<span class="dot" style="width:22px;height:22px;background:${i < fichas ? 'var(--acc)' : 'transparent'};border:2px solid var(--acc)"></span>`).join('')}</span></div>
        <button type="button" class="btn btn-acc btn-block" style="min-height:84px;font-size:30px;border-radius:22px" data-act="falta" ${fichas > 0 && c ? '' : 'disabled'}>${ICON.flag} ¡Falta!</button>
        <div class="mut" style="font-size:13px;text-align:center;line-height:1.5">Pausa el turno y abre el debate. Gasta 1 ficha, que se devuelve si la reconocen.</div></div>${hb}`;
  }

  function standings(s, final) {
    const sorted = s.groups.slice().sort((a, b) => b.score - a.score);
    const pos = sorted.findIndex(g => g.id === s.me.groupId) + 1;
    const mg = myGroup(s);
    const btn = s.me.isHost ? (final ? `<button type="button" class="btn btn-acc btn-block" data-act="restart">Otra partida</button>`
      : `<button type="button" class="btn btn-acc btn-block" data-act="next">Siguiente: ronda ${s.round + 1} · ${ROUNDS[s.round + 1].name}</button>`) : '<div class="mut">El anfitrión continúa la partida.</div>';
    return `${kicker(null, final ? 'Resultado final' : 'Clasificación tras la ronda ' + s.round)}
      <div class="title" style="font-size:34px">${final ? (pos === 1 ? '¡Habéis ganado!' : `Quedáis en ${pos}º lugar`) : mg ? `Vais ${pos}º` : 'Clasificación'}</div>
      <div style="display:flex;flex-direction:column;gap:8px">${sorted.map((g, i) => `<div class="card" style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:16px;${g.id === s.me.groupId ? 'border-color:var(--acc)' : ''}">
        <span class="display" style="font-weight:700;width:20px">${i + 1}</span>${dot(g.color, 12)}<span style="flex:1;font-weight:700">${esc(g.name)}</span><span class="display" style="font-weight:700;font-size:22px">${g.score}</span></div>`).join('')}</div>
      <div class="grow"></div>${btn}`;
  }

  const prepNav = (s, first) => `<div class="tabs" role="tablist" style="margin-bottom:4px">
      <button type="button" role="tab" class="${prepTab === 'partida' ? 'on' : ''}" data-act="prepTab" data-arg="partida">${first}</button>
      <button type="button" role="tab" class="${prepTab === 'canciones' ? 'on' : ''}" data-act="prepTab" data-arg="canciones">Mis canciones · ${s.me.list.length}</button></div>`;
  const songsIntro = s => `${kicker(myGroup(s), 'Sala ' + s.code)}<div class="title">Mis canciones</div>
      <div class="mut" style="font-size:14px;line-height:1.5">Busca canciones y añádelas a tu lista. En la ronda 1, cuando te toque, podrás proponerlas con un toque.</div>`;

  /* ---------------- Pintar ---------------- */
  function render(s) {
    S = s;
    let html = '', mode = null, title = '';
    if (!s.me.groupId && s.phase !== 'lobby') {
      html = `${kicker(null, 'Sala ' + s.code)}<div class="title">La partida ya ha empezado</div><div style="font-weight:600">Únete a un grupo</div>
        <div style="display:flex;flex-direction:column;gap:8px">${s.groups.map(g => `<button type="button" class="gbtn" data-act="joinGroup" data-arg="${g.id}">${dot(g.color, 16)}<span style="font-weight:700">${esc(g.name)}</span></button>`).join('')}</div>`;
    } else switch (s.phase) {
      case 'lobby':
        if (prepTab === 'canciones') { html = prepNav(s, 'Partida') + songsIntro(s); mode = 'list'; }
        else html = prepNav(s, 'Partida') + lobby(s);
        break;
      case 'roundIntro':
        if (s.round !== 1) { html = roundIntro(s); break; }
        if (prepTab === 'canciones') { html = prepNav(s, 'Ronda 1') + songsIntro(s); mode = 'list'; }
        else html = prepNav(s, 'Ronda 1') + roundIntro(s);
        break;
      case 'r1':
        html = s.r1 ? r1(s) : '';
        if (s.r1 && s.r1.step === 'choosing') {
          if (s.me.id === s.r1.proposerId) { mode = 'propose'; title = ''; }
          else { mode = 'list'; title = 'Mientras, prepara tu lista.'; }
        }
        break;
      case 'r24': html = s.r24 ? r24(s) : ''; break;
      case 'standings': html = standings(s, false); break;
      case 'final': html = standings(s, true); break;
    }
    if (s.phase !== 'lobby' || !s.me.groupId) editingName = false;
    if (html !== lastHtml) {
      const ae = document.activeElement;
      const keep = ae && ae.id && $main.contains(ae) && ae.tagName === 'INPUT' ? { id: ae.id, v: ae.value, a: ae.selectionStart, b: ae.selectionEnd } : null;
      $main.innerHTML = html; lastHtml = html; refreshPlayButtons();
      if (keep) { const el = $(keep.id); if (el) { el.value = keep.v; el.focus(); try { el.setSelectionRange(keep.a, keep.b); } catch (e) {} } }
    }
    if (focusName) { focusName = false; const el = $('gname'); if (el) { el.focus(); el.select(); } }
    setPanel(mode, title);
    syncCardAudio(s);
  }
  function syncCardAudio(s) {
    const c = s.phase === 'r24' && s.r24 && s.r24.step === 'playing' && s.me.id === s.r24.clueGiverId && s.r24.card;
    if (c) {
      if (c.drawId !== cardDrawId) {
        cardDrawId = c.drawId;
        audio.src = c.previewUrl;
        audio.play().catch(() => {});
        playingKey = 'card:' + c.drawId;
      }
    } else if (playingKey && playingKey.startsWith('card')) { stopAudio(); cardDrawId = null; }
  }

  /* ---------------- Panel de canciones ---------------- */
  let panelMode = null, tab = 'search', results = [], hiddenCount = 0, searchSeq = 0, searchTimer = null;
  const inList = id => S.me.list.some(x => x.id === id);
  function songRow(song, key, actions) {
    return `<li>${cover(song, 48, 10)}<div class="s-meta"><div class="s-title">${esc(song.title)}</div><div class="s-art">${esc(song.artist)}${song.album ? ' · ' + esc(song.album) : ''}</div></div>
      <button type="button" class="icon-btn" data-pact="play" data-key="${key}" data-id="${esc(song.id)}" aria-label="Escuchar fragmento de ${esc(song.title)}">${playingKey === key ? ICON.stop : ICON.play}</button>${actions}</li>`;
  }
  function setPanel(mode, title) {
    if (!mode) { $panel.hidden = true; panelMode = null; return; }
    $panel.hidden = false;
    if (panelMode !== mode) { panelMode = mode; tab = S.me.list.length ? 'list' : 'search'; }
    $('panelTitle').textContent = title;
    $('panelTitle').style.display = title ? '' : 'none';
    renderPanel();
  }
  function renderPanel() {
    if (!S) return;
    $panel.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    $('tab-search').style.display = tab === 'search' ? 'flex' : 'none';
    $('tab-list').style.display = tab === 'list' ? 'flex' : 'none';
    $('listCount').textContent = S.me.list.length;
    const propose = panelMode === 'propose';
    $('results').innerHTML = results.map(song => songRow(song, 'r' + song.id, propose
      ? `<button type="button" class="sm-btn btn-acc" data-pact="propose" data-src="r" data-id="${esc(song.id)}">Proponer</button>`
      : inList(song.id) ? `<button type="button" class="sm-btn btn-sec" disabled>En lista</button>` : `<button type="button" class="sm-btn btn-sec" data-pact="add" data-id="${esc(song.id)}">+ Lista</button>`)).join('');
    $('resultsNote').textContent = hiddenCount ? `${hiddenCount} resultado${hiddenCount === 1 ? '' : 's'} oculto${hiddenCount === 1 ? '' : 's'} (karaoke y versiones)` : '';
    $('mylist').innerHTML = S.me.list.map(song => songRow(song, 'l' + song.id, propose
      ? `<button type="button" class="sm-btn btn-acc" data-pact="propose" data-src="l" data-id="${esc(song.id)}">Proponer</button>`
      : `<button type="button" class="sm-btn btn-sec" data-pact="remove" data-id="${esc(song.id)}">Quitar</button>`)).join('');
    $('listNote').textContent = S.me.list.length ? '' : 'Tu lista está vacía. Busca canciones y pulsa «+ Lista».';
  }
  $('q').addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = $('q').value.trim();
    if (!q) { results = []; hiddenCount = 0; renderPanel(); return; }
    searchTimer = setTimeout(async () => {
      const seq = ++searchSeq;
      $('resultsNote').textContent = 'Buscando…';
      const r = await HU.search(q);
      if (seq !== searchSeq) return;
      if (r.error) { results = []; hiddenCount = 0; renderPanel(); $('resultsNote').textContent = r.error; return; }
      results = r.results || []; hiddenCount = r.hidden || 0;
      renderPanel();
      if (!results.length) $('resultsNote').textContent = 'Sin resultados con fragmento.';
    }, 350);
  });
  $panel.addEventListener('click', async e => {
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; renderPanel(); if (tab === 'search') $('q').focus(); return; }
    const b = e.target.closest('[data-pact]');
    if (!b || b.disabled) return;
    const id = b.dataset.id;
    const song = results.find(x => x.id === id) || S.me.list.find(x => x.id === id);
    if (!song) return;
    if (b.dataset.pact === 'play') return playSong(b.dataset.key, song);
    if (b.dataset.pact === 'add') { await act('listAdd', { song }); return; }
    if (b.dataset.pact === 'remove') { await act('listRemove', { id }); return; }
    if (b.dataset.pact === 'propose') {
      stopAudio();
      b.disabled = true;
      const r = await act('propose', { song });
      if (!r.error) { $('q').value = ''; results = []; hiddenCount = 0; }
      else b.disabled = false;
    }
  });

  $main.addEventListener('submit', async e => {
    if (e.target.id !== 'gform') return;
    e.preventDefault();
    const g = S && myGroup(S), name = $('gname').value.trim();
    if (!g) return;
    if (!name) return toast('Escribe un nombre', true);
    if (name !== g.name) { const r = await act('renameGroup', { groupId: g.id, name }); if (r.error) return; }
    editingName = false; lastHtml = ''; render(S);
  });

  /* ---------------- Botones de la pantalla ---------------- */
  $main.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const a = b.dataset.act, arg = b.dataset.arg;
    unlockAudio();
    switch (a) {
      case 'prepTab': prepTab = arg; lastHtml = ''; if (S) render(S); return;
      case 'joinGroup': return act('joinGroup', { groupId: arg });
      case 'editName': editingName = true; focusName = true; lastHtml = ''; return render(S);
      case 'cancelName': editingName = false; lastHtml = ''; return render(S);
      case 'setGroups': return act('setGroups', { n: +arg });
      case 'buzz': if (navigator.vibrate) navigator.vibrate(40); return act('buzz');
      case 'judge': return act('judge', { verdict: arg });
      case 'faltaChoice': return act('faltaChoice', { choice: arg });
      case 'replay': try { audio.currentTime = 0; audio.play().catch(() => {}); } catch (err) {} return;
      case 'endRound': if (confirm('¿Terminar la ronda ahora?')) return act('endRound'); return;
      case 'skipTurn': if (confirm('¿Pasar este turno?')) return act('skipTurn'); return;
      case 'falta': if (navigator.vibrate) navigator.vibrate([30, 40, 30]); return act('falta');
      default: return act(a);
    }
  });

  boot();
})();
