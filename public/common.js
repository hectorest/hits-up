// Utilidades compartidas por la TV y el móvil
window.HU = (() => {
  let offset = 0;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sNow = () => Date.now() + offset;

  function connect(url, onState, onStatus) {
    let es, closed = false;
    const open = () => {
      es = new EventSource(url);
      es.onopen = () => onStatus && onStatus(true);
      es.onmessage = e => {
        const s = JSON.parse(e.data);
        offset = s.now - Date.now();
        s._recv = Date.now();
        onState(s);
      };
      es.onerror = () => {
        onStatus && onStatus(false);
        if (es.readyState === 2 && !closed) setTimeout(open, 2500);
      };
    };
    open();
    return () => { closed = true; es.close(); };
  }
  async function post(path, body) {
    try {
      const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
      return await r.json();
    } catch (e) { return { error: 'Sin conexión con el servidor' }; }
  }
  async function get(path) {
    try { const r = await fetch(path); return await r.json(); } catch (e) { return { error: 'Sin conexión con el servidor' }; }
  }

  const group = (s, id) => s.groups.find(g => g.id === id);
  const dot = (color, size = 12) => `<span class="dot" style="background:${color};width:${size}px;height:${size}px"></span>`;
  const chip = (g, size) => g ? `<span class="chip" style="--gc:${g.color}${size ? ';font-size:' + size + 'px' : ''}">${dot(g.color, 10)}${esc(g.name)}</span>` : '';
  const vinyl = size => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/></svg>`;
  const cover = (song, px, radius) => song && song.cover
    ? `<img class="cover" src="${esc(song.cover)}" width="${px}" height="${px}" alt="" style="width:${px}px;height:${px}px;border-radius:${radius || 12}px">`
    : `<div class="cover-ph" style="width:${px}px;height:${px}px;border-radius:${radius || 12}px">${vinyl(Math.round(px * 0.5))}</div>`;
  const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const ring = (size, stroke, until, total, label) => {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r;
    return `<div class="ring" style="width:${size}px;height:${size}px">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#2A2E3B" stroke-width="${stroke}"/>
      <circle data-ring-until="${until}" data-total="${total}" data-c="${c}" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--acc)" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>
      <div class="display" style="font-weight:700;font-size:${Math.round(size * 0.4)}px" data-until="${until}" data-fmt="sec">${label ?? ''}</div></div>`;
  };
  const ROUNDS = {
    1: { name: 'La Selección', rules: ['Cada grupo propone canciones por turnos.', 'Los rivales pulsan y responden en 5 s.', 'Solo entran al mazo las que alguien acierta.'], pts: 'Título +2 (+1 si es en los primeros 10 s) · Solo artista +1 · Fallo −1 · Tu canción acertada +1' },
    2: { name: 'Descríbela', rules: ['Una persona escucha la canción con auriculares.', 'La describe sin decir título ni artista.', 'Prohibido cantar o tararear.'], pts: '2 puntos por carta' },
    3: { name: 'Taréala', rules: ['Tararea la melodía: na-na-na, silbar, pom-pom.', 'Gestos moderados, sin bailar.', 'Prohibido cantar la letra o decir palabras.'], pts: '3 puntos por carta' },
    4: { name: 'Báilala', rules: ['Baila y haz mímica con la canción.', 'Prohibido hacer cualquier sonido.', 'Ni mover los labios con la letra.'], pts: '4 puntos por carta' }
  };
  const ICON = {
    play: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><polygon points="7 4 20 12 7 20 7 4"/></svg>',
    stop: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="8" y1="5" x2="8" y2="19"/><line x1="16" y1="5" x2="16" y2="19"/></svg>',
    check: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 12 10 18 20 6"/></svg>',
    x: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>',
    flag: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></svg>',
    headphones: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/></svg>',
    repeat: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 3 3 9 9 9"/></svg>',
    search: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16" y2="16"/></svg>',
    mute: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="16" y1="9" x2="22" y2="15"/><line x1="22" y1="9" x2="16" y2="15"/></svg>',
    pause: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><line x1="8" y1="5" x2="8" y2="19"/><line x1="16" y1="5" x2="16" y2="19"/></svg>'
  };

  // Actualiza cuentas atrás, barras y anillos sin volver a pintar la pantalla
  setInterval(() => {
    const t = sNow();
    document.querySelectorAll('[data-until]').forEach(el => {
      const ms = +el.dataset.until - t;
      el.textContent = el.dataset.fmt === 'sec' ? Math.max(0, Math.ceil(ms / 1000)) : fmt(ms);
    });
    document.querySelectorAll('[data-bar-until]').forEach(el => {
      const ms = +el.dataset.barUntil - t;
      el.style.width = Math.max(0, Math.min(100, ms / +el.dataset.total * 100)) + '%';
    });
    document.querySelectorAll('[data-ring-until]').forEach(el => {
      const ms = +el.dataset.ringUntil - t, c = +el.dataset.c;
      const f = Math.max(0, Math.min(1, ms / +el.dataset.total));
      el.setAttribute('stroke-dasharray', (c * f) + ' ' + c);
    });
    document.querySelectorAll('[data-played]').forEach(el => {
      const ms = +el.dataset.played + (el.dataset.playing === '1' ? Date.now() - +el.dataset.recv : 0);
      const total = +el.dataset.total;
      if (el.dataset.kind === 'bar') el.style.width = Math.min(100, ms / total * 100) + '%';
      else el.textContent = fmt(Math.min(ms, total) - 999);
    });
  }, 100);

  function toast(msg, isErr) {
    const el = document.createElement('div');
    el.className = 'toast' + (isErr ? ' err' : '');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  return { esc, sNow, connect, post, get, group, dot, chip, cover, vinyl, fmt, ring, ROUNDS, ICON, toast };
})();
