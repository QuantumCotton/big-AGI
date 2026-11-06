// big-AGI v2 — procedural persona sigils
// Every persona gets a deterministic, layered SVG mark derived from its id hash.
// No emoji-as-art (fleet law); geometry + layered gradients only.

function hashCode(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rngFrom(seed) {
  let s = seed || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

const PALETTES = [
  ['#4fd8e8', '#8b7bff', '#0e141d'],
  ['#8b7bff', '#ff7ab8', '#120e1d'],
  ['#52d98b', '#4fd8e8', '#0a1611'],
  ['#ffb454', '#ff7ab8', '#1d120e'],
  ['#4f9ee8', '#8b7bff', '#0d1220'],
  ['#e8e14f', '#52d98b', '#141a0c'],
  ['#ff8a5c', '#e85c8a', '#1d0f14'],
  ['#5cc8ff', '#7affd8', '#0a1420'],
];

// Upstream persona icon reused where the old app had one (DeveloperPreview).
const IMAGE_PERSONAS = { DeveloperPreview: 'assets/dev_preview_icon_120x120.webp' };

function sigilSVG(personaId, size = 46) {
  if (IMAGE_PERSONAS[personaId]) {
    const u = IMAGE_PERSONAS[personaId];
    return `<span class="sig" style="width:${size}px;height:${size}px;display:inline-block;border-radius:12px;overflow:hidden;flex:none"><img src="${u}" width="${size}" height="${size}" alt="" style="display:block;width:100%;height:100%"></span>`;
  }
  const h = hashCode(personaId);
  const rnd = rngFrom(h);
  const palette = PALETTES[h % PALETTES.length];
  const petals = 3 + Math.floor(rnd() * 5);        // 3..7
  const ringR = 30 + rnd() * 8;
  const petalR = 12 + rnd() * 10;
  const nodes = 3 + Math.floor(rnd() * 4);
  const rot = Math.floor(rnd() * 90);
  const inner = 5.5 + rnd() * 5;
  const gid = 'g' + h.toString(36);

  let petalEls = '';
  for (let i = 0; i < petals; i++) {
    const a = (360 / petals) * i + rot;
    petalEls += `<ellipse cx="50" cy="${50 - ringR * 0.52}" rx="${petalR * 0.42}" ry="${petalR}" transform="rotate(${a} 50 50)" fill="url(#${gid}a)" opacity="0.85"/>`;
  }
  let nodeEls = '';
  for (let i = 0; i < nodes; i++) {
    const a = ((360 / nodes) * i + rot * 1.7) * Math.PI / 180;
    const r = ringR + 7;
    const x = 50 + r * Math.cos(a), y = 50 + r * Math.sin(a);
    nodeEls += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(1.7 + rnd() * 1.4).toFixed(1)}" fill="${palette[1]}" opacity="0.95"/>`;
  }
  let arcEls = '';
  for (let i = 0; i < 2; i++) {
    const r = ringR + 4 + i * 4.5;
    const a0 = rnd() * 360, sweep = 90 + rnd() * 150;
    const x0 = (50 + r * Math.cos(a0 * Math.PI / 180)).toFixed(1), y0 = (50 + r * Math.sin(a0 * Math.PI / 180)).toFixed(1);
    const a1 = a0 + sweep;
    const x1 = (50 + r * Math.cos(a1 * Math.PI / 180)).toFixed(1), y1 = (50 + r * Math.sin(a1 * Math.PI / 180)).toFixed(1);
    arcEls += `<path d="M ${x0} ${y0} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x1} ${y1}" stroke="${palette[i ? 1 : 0]}" stroke-width="1.1" fill="none" opacity="0.6" stroke-linecap="round"/>`;
  }

  return `<svg class="sig" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="persona sigil" style="flex:none">
  <defs>
    <radialGradient id="${gid}c" cx="50%" cy="42%"><stop offset="0%" stop-color="${palette[2]}"/><stop offset="100%" stop-color="${palette[2]}"/></radialGradient>
    <linearGradient id="${gid}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${palette[0]}"/><stop offset="100%" stop-color="${palette[1]}"/></linearGradient>
    <radialGradient id="${gid}b" cx="50%" cy="35%" r="75%">
      <stop offset="0%" stop-color="${palette[0]}" stop-opacity="0.30"/>
      <stop offset="100%" stop-color="${palette[2]}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="2" y="2" width="96" height="96" rx="24" fill="url(#${gid}c)" stroke="${palette[0]}" stroke-opacity="0.35" stroke-width="1"/>
  <rect x="2" y="2" width="96" height="96" rx="24" fill="url(#${gid}b)"/>
  ${petalEls}
  <circle cx="50" cy="50" r="${inner.toFixed(1)}" fill="url(#${gid}a)"/>
  <circle cx="50" cy="50" r="${(inner * 0.45).toFixed(1)}" fill="${palette[2]}"/>
  ${arcEls}
  ${nodeEls}
</svg>`;
}

export { sigilSVG };
