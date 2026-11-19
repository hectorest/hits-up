// Ilustraciones de cada ronda e iconos de las reglas (SVG dibujado a mano)
(() => {
  const C = { acc: '#FF5A7A', pur: '#8B7CFF', lav: '#C9C2FF', teal: '#3ED8C3', amb: '#FFB547', blue: '#5AA9FF', ink: '#F2F3F7', dark: '#222633', dark2: '#1F2330', line: '#4A5063', bg: '#0E1016', ko: '#FF6B6B', mut: '#A3A9B8' };

  // Persona con auriculares. mouth: 'talk' | 'o' | 'smile'
  function person(cx, cy, mouth) {
    const m = mouth === 'talk' ? `<ellipse cx="${cx}" cy="${cy + 10}" rx="7" ry="5" fill="${C.bg}"/>`
      : mouth === 'o' ? `<circle cx="${cx}" cy="${cy + 10}" r="4.5" fill="${C.bg}"/>`
      : `<path d="M${cx - 7} ${cy + 8} Q${cx} ${cy + 15} ${cx + 7} ${cy + 8}" stroke="${C.bg}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    return `<path d="M${cx - 36} ${cy + 74} Q${cx - 36} ${cy + 32} ${cx} ${cy + 32} Q${cx + 36} ${cy + 32} ${cx + 36} ${cy + 74} Z" fill="${C.pur}"/>
      <circle cx="${cx}" cy="${cy}" r="24" fill="${C.lav}"/>
      <circle cx="${cx - 8}" cy="${cy - 3}" r="2.8" fill="${C.bg}"/><circle cx="${cx + 8}" cy="${cy - 3}" r="2.8" fill="${C.bg}"/>${m}
      <path d="M${cx - 27} ${cy + 2} A27 27 0 0 1 ${cx + 27} ${cy + 2}" stroke="${C.acc}" stroke-width="6" fill="none" stroke-linecap="round"/>
      <rect x="${cx - 33}" y="${cy - 6}" width="11" height="19" rx="5" fill="${C.acc}"/><rect x="${cx + 22}" y="${cy - 6}" width="11" height="19" rx="5" fill="${C.acc}"/>`;
  }
  const note = (x, y, color, k = 1) => `<g transform="translate(${x} ${y}) scale(${k})"><path d="M6 0 V-26 L20 -30 V-6" stroke="${color}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="1" cy="1" rx="7" ry="5.5" fill="${color}"/><ellipse cx="15" cy="-5" rx="7" ry="5.5" fill="${color}"/></g>`;
  const forbid = (cx, cy, r, inner) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.dark2}"/>${inner}<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.ko}" stroke-width="5"/><line x1="${cx - r * 0.7}" y1="${cy + r * 0.7}" x2="${cx + r * 0.7}" y2="${cy - r * 0.7}" stroke="${C.ko}" stroke-width="5" stroke-linecap="round"/>`;

  const ART = {
    1: () => `
      <g transform="rotate(-12 45 140)"><rect x="18" y="104" width="46" height="62" rx="8" fill="${C.teal}"/></g>
      <g transform="rotate(-2 58 138)"><rect x="34" y="100" width="46" height="62" rx="8" fill="${C.amb}"/></g>
      <g transform="rotate(9 72 136)"><rect x="50" y="98" width="46" height="62" rx="8" fill="${C.pur}"/><circle cx="73" cy="129" r="12" fill="none" stroke="${C.ink}" stroke-width="3"/><circle cx="73" cy="129" r="3" fill="${C.ink}"/></g>
      <rect x="70" y="14" width="112" height="76" rx="12" fill="${C.dark}" stroke="${C.line}" stroke-width="3"/>
      ${[22, 34, 16, 40, 28, 44, 20, 32].map((h, i) => `<rect x="${84 + i * 11}" y="${76 - h}" width="7" height="${h}" rx="3.5" fill="${C.acc}" opacity="${i % 2 ? 0.65 : 1}"/>`).join('')}
      <path d="M112 90 L106 104 M140 90 L146 104" stroke="${C.line}" stroke-width="4" stroke-linecap="round"/>
      <path d="M192 36 Q202 52 192 68" stroke="${C.acc}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".8"/>
      <path d="M202 26 Q220 52 202 78" stroke="${C.acc}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".45"/>
      <rect x="164" y="92" width="58" height="86" rx="11" fill="${C.dark2}" stroke="${C.line}" stroke-width="3"/>
      <circle cx="193" cy="135" r="26" fill="none" stroke="${C.acc}" stroke-opacity=".3" stroke-width="5"/>
      <circle cx="193" cy="135" r="19" fill="${C.acc}"/>`,
    2: () => `${person(72, 74, 'talk')}
      ${note(22, 40, C.acc, 0.7)}
      <rect x="118" y="14" width="112" height="72" rx="18" fill="${C.ink}"/><path d="M138 82 L124 104 L160 84 Z" fill="${C.ink}"/>
      <rect x="134" y="32" width="80" height="8" rx="4" fill="${C.mut}"/><rect x="134" y="47" width="60" height="8" rx="4" fill="${C.mut}"/><rect x="134" y="62" width="70" height="8" rx="4" fill="${C.mut}"/>
      ${forbid(194, 142, 26, note(185, 153, C.ink, 0.75))}`,
    3: () => `${person(72, 80, 'o')}
      ${note(118, 76, C.acc, 0.9)}${note(150, 52, C.teal, 1)}${note(186, 32, C.amb, 1.1)}
      <path d="M100 92 Q108 86 112 78" stroke="${C.acc}" stroke-width="3" fill="none" stroke-linecap="round" stroke-dasharray="2 6"/>
      ${forbid(194, 140, 26, `<rect x="180" y="128" width="28" height="18" rx="6" fill="${C.ink}"/><path d="M186 145 L182 153 L192 146 Z" fill="${C.ink}"/><rect x="185" y="134" width="18" height="3" rx="1.5" fill="${C.mut}"/><rect x="185" y="139" width="12" height="3" rx="1.5" fill="${C.mut}"/>`)}`,
    4: () => `
      <path d="M200 0 V14" stroke="${C.line}" stroke-width="2"/>
      <clipPath id="hu-ball"><circle cx="200" cy="34" r="20"/></clipPath>
      <circle cx="200" cy="34" r="20" fill="#B9BECB"/>
      <g clip-path="url(#hu-ball)">
        ${[0, 1, 2, 3, 4, 5].map(i => `<rect x="${180 + i * 7}" y="14" width="7" height="40" fill="${i % 2 ? '#9AA0B0' : '#D6DAE3'}"/>`).join('')}
        <path d="M180 21 H220 M180 28 H220 M180 35 H220 M180 42 H220 M180 49 H220 M187 14 V54 M194 14 V54 M201 14 V54 M208 14 V54 M215 14 V54" stroke="${C.dark}" stroke-width="1.6"/>
        <rect x="187" y="21" width="7" height="7" fill="${C.ink}"/><rect x="208" y="35" width="7" height="7" fill="${C.teal}" opacity=".8"/><rect x="194" y="42" width="7" height="7" fill="${C.acc}" opacity=".7"/>
      </g>
      <path d="M170 18 l3 -8 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 Z" fill="${C.amb}"/>
      <path d="M230 52 l2 -5 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 Z" fill="${C.ink}"/>
      <path d="M226 14 l1.5 -4 l1.5 4 l4 1.5 l-4 1.5 l-1.5 4 l-1.5 -4 l-4 -1.5 Z" fill="${C.teal}"/>
      <path d="M118 66 L114 112" stroke="${C.pur}" stroke-width="24" stroke-linecap="round"/>
      <polyline points="116,74 88,58 72,32" stroke="${C.lav}" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <polyline points="120,76 150,88 170,66" stroke="${C.lav}" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <polyline points="112,114 94,140 84,170" stroke="${C.lav}" stroke-width="13" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <polyline points="116,114 142,134 164,150" stroke="${C.lav}" stroke-width="13" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="122" cy="40" r="19" fill="${C.lav}"/><circle cx="116" cy="38" r="2.4" fill="${C.bg}"/><circle cx="128" cy="38" r="2.4" fill="${C.bg}"/>
      <path d="M115 46 Q122 52 129 46" stroke="${C.bg}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <path d="M100 42 A22 22 0 0 1 144 42" stroke="${C.acc}" stroke-width="5" fill="none" stroke-linecap="round"/>
      <rect x="96" y="35" width="9" height="15" rx="4" fill="${C.acc}"/><rect x="139" y="35" width="9" height="15" rx="4" fill="${C.acc}"/>
      <path d="M58 30 Q50 44 58 58 M180 76 Q190 86 182 98" stroke="${C.acc}" stroke-width="3.5" fill="none" stroke-linecap="round" opacity=".7"/>
      ${forbid(40, 140, 26, `<path d="M28 133 h7 l9 -8 v30 l-9 -8 h-7 Z" fill="${C.ink}"/><path d="M48 134 Q53 140 48 146" stroke="${C.ink}" stroke-width="3" fill="none" stroke-linecap="round"/>`)}`
  };
  function art(round, width) {
    const w = width || 240;
    return `<svg width="${w}" height="${Math.round(w * 180 / 240)}" viewBox="0 0 240 180" role="img" aria-label="Ilustración de la ronda ${round}">${ART[round]()}</svg>`;
  }

  // Iconos de reglas (24×24, trazo)
  const P = {
    propose: '<path d="M4 6h10M4 12h10M4 18h6"/><path d="M18 14v8M14 18h8"/>',
    tv: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M9 21h6M12 17v4"/>',
    buzz: '<circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="9.5"/>',
    deck: '<rect x="8" y="3" width="12" height="16" rx="2"/><path d="M5 7v12a2 2 0 0 0 2 2h9"/>',
    talk: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12Z"/>',
    headphones: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
    title: '<path d="M4 7V5h16v2M12 5v14M9 19h6"/>',
    note: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    hum: '<path d="M2 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0"/>',
    hands: '<path d="M7 11V6a2 2 0 0 1 4 0v5M11 10V4a2 2 0 0 1 4 0v6M15 10V6a2 2 0 0 1 4 0v8a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-3l-2-3a2 2 0 0 1 3-2l1 1"/>',
    lyrics: '<path d="M9 18V6l7-2"/><circle cx="6" cy="18" r="3"/><path d="M14 10h7M14 14h7M14 18h5"/>',
    dance: '<circle cx="13" cy="4" r="2"/><path d="M13 7l-2 6 3 3v5M11 13l-4 3M13 9l5-2M11 13l-3 7"/>',
    mute: '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M16 9l6 6M22 9l-6 6"/>',
    lips: '<path d="M3 12c3-4 6-5 9-3 3-2 6-1 9 3-3 4-6 6-9 6s-6-2-9-6Z"/><path d="M3 12h18"/>'
  };
  const icon = (k, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[k]}</svg>`;

  const RULES = {
    1: { steps: [['propose', 'Cada grupo propone una canción, por turnos'], ['tv', 'Suena en la tele'], ['buzz', 'Los rivales pulsan y responden en 5 s'], ['deck', 'Solo entran al mazo las que alguien acierta']] },
    2: { ok: [['talk', 'Descríbela: época, de qué trata, dónde sonaba'], ['headphones', 'Solo tú la oyes, con auriculares']], no: [['title', 'Decir el título o el artista'], ['note', 'Cantar o tararear']] },
    3: { ok: [['hum', 'Tararear: na-na-na, silbar, pom-pom'], ['hands', 'Gestos moderados']], no: [['lyrics', 'Cantar la letra o decir palabras'], ['dance', 'Bailar']] },
    4: { ok: [['dance', 'Bailar y hacer mímica']], no: [['mute', 'Hacer cualquier sonido'], ['lips', 'Mover los labios con la letra']] }
  };
  const row = (cls, [k, t], s) => `<div class="rule ${cls}"><span class="ri">${icon(k, s)}</span><span>${HU.esc(t)}</span></div>`;
  // Lista de reglas con iconos. opts.only = 'no' muestra solo lo prohibido
  function rules(round, opts = {}) {
    const R = RULES[round], s = opts.iconSize || 20;
    if (R.steps) return `<div class="rules2">${R.steps.map(r => row('step', r, s)).join('')}</div>`;
    const parts = [];
    if (opts.only !== 'no') parts.push(...R.ok.map(r => row('ok', r, s)));
    parts.push(...R.no.map(r => row('no', r, s)));
    return `<div class="rules2">${parts.join('')}</div>`;
  }

  window.HU_ART = { art, icon, rules, RULES };
})();
