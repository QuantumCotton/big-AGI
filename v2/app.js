// big-AGI v2 — the Persona Suite. Zero-backend AI chat + beam, BYO keys.
// State in localStorage. No CDNs, no build step, ES modules.

import { PERSONAS, PERSONA_ORDER, DEFAULT_PERSONA } from './personas.js';
import { sigilSVG } from './sigils.js';
import { streamChat } from './adapters.js';

/* ================= state ================= */

const LS_KEY = 'bagi.v2.state.v1';

const DEFAULT_PROVIDERS = [
  { id: 'openai',    kind: 'openai',    label: 'OpenAI',      baseUrl: 'https://api.openai.com/v1', key: '', model: 'gpt-4o-mini' },
  { id: 'openrouter',kind: 'openai',    label: 'OpenRouter',  baseUrl: 'https://openrouter.ai/api/v1', key: '', model: 'anthropic/claude-3.5-sonnet' },
  { id: 'groq',      kind: 'openai',    label: 'Groq',        baseUrl: 'https://api.groq.com/openai/v1', key: '', model: 'llama-3.3-70b-versatile' },
  { id: 'anthropic', kind: 'anthropic', label: 'Anthropic',   baseUrl: 'https://api.anthropic.com', key: '', model: 'claude-3-5-sonnet-latest' },
  { id: 'gemini',    kind: 'gemini',    label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', key: '', model: 'gemini-1.5-flash' },
  { id: 'zai',       kind: 'openai',    label: 'Z.ai (GLM)',  baseUrl: 'https://api.z.ai/api/paas/v4', key: '', model: 'glm-4-flash' },
  { id: 'local',     kind: 'openai',    label: 'Local (Ollama)', baseUrl: 'http://localhost:11434/v1', key: '', model: 'qwen2.5:7b' },
];

let state = load() || {
  settings: { providers: structuredClone(DEFAULT_PROVIDERS), activeProviderId: 'openai', temperature: 0.7, maxTokens: 2048 },
  conversations: [],
};

function load() {
  try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : null; }
  catch { return null; }
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { toast('Storage full — export & prune history'); }
  }, 250);
}

let view = 'gallery';          // gallery | chat | beam
let convId = null;             // active conversation id
let beamSel = [];              // provider ids for beam mode
let abortCtl = null;
let editingPersona = null;     // persona editor context

const $ = sel => document.querySelector(sel);
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const conv = () => state.conversations.find(c => c.id === convId);
function provider(id) { return state.settings.providers.find(p => p.id === (id || state.settings.activeProviderId)); }
function hasKey(p) { return !!p && (!!p.key || p.baseUrl.includes('localhost') || p.baseUrl.includes('127.0.0.1')); }

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ============ persona system-prompt template vars (upstream big-AGI macros) ============ */

function renderSystemMessage(tpl) {
  const now = new Date();
  const loc = now.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' });
  return tpl
    .replace(/\{\{LLM\.Cutoff\}\}/g, 'the knowledge cutoff of the underlying model')
    .replace(/\{\{LocaleNow\}\}/g, loc)
    .replace(/\{\{Today\}\}/g, now.toISOString().slice(0, 10))
    .replace(/\{\{RenderMermaid\}\}/g, 'When a diagram helps, emit Mermaid syntax inside a ```mermaid code block.')
    .replace(/\{\{RenderPlantUML\}\}/g, 'When architecture diagrams help, PlantUML syntax in a ```plantuml code block is supported.')
    .replace(/\{\{RenderSVG\}\}/g, 'You may render vector graphics as raw SVG inside a ```svg code block.')
    .replace(/\{\{PreferTables\}\}/g, 'Prefer compact markdown tables when comparing things.');
}

/* ================= markdown-lite renderer (streaming-safe) ================= */

function renderMarkdown(src) {
  const codeBlocks = [];
  let s = String(src ?? '');
  // fenced code
  s = s.replace(/```(\w*)\n?([\s\S]*?)(```|$)/g, (m, lang, code) => {
    const i = codeBlocks.length;
    codeBlocks.push({ lang, code });
    return `\u0000CB${i}\u0000`;
  });
  s = esc(s);
  // tables (GFM-lite)
  s = s.replace(/(^|\n)((?:\|[^\n]*)+\n)(?:\|[ :|-]+\n)((?:\|[^\n]*)+\n?)+/g, (m, pre, headRow, _sep, _body) => {
    const rows = m.trim().split('\n').filter(r => !/^\|[ :|-]+\|$/.test(r.trim()));
    const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    const head = cells(rows[0]);
    const body = rows.slice(1).map(cells);
    let out = '<table><thead><tr>' + head.map(h => `<th>${mdInline(h)}</th>`).join('') + '</tr></thead><tbody>';
    for (const r of body) out += '<tr>' + r.map(c => `<td>${mdInline(c)}</td>`).join('') + '</tr>';
    return out + '</tbody></table>';
  });
  s = s.replace(/^### (.*)$/gm, '<h3>$1</h3>').replace(/^## (.*)$/gm, '<h2>$1</h2>').replace(/^# (.*)$/gm, '<h1>$1</h1>');
  s = s.replace(/^&gt; ?(.*)$/gm, '<blockquote>$1</blockquote>');
  s = s.replace(/^ {0,3}(-{3,}|\*{3,})$/gm, '<hr>');
  s = s.replace(/^(\s*)[-*] (.*)$/gm, (m, ind, txt) => `${ind}\u0000LI${esc ? '' : ''}<li>${txt}</li>\u0000`); // placeholder pass
  // simpler list pass: wrap consecutive <li>
  s = s.replace(/(?:^|\n)((?:[ ]*<li>.*<\/li>\n?)+)/g, (m, block) => '\n<ul>' + block.replace(/\n+/g, '\n') + '</ul>\n');
  s = s.replace(/\u0000LI/g, '');
  // ordered lists
  s = s.replace(/(?:^|\n)((?:[ ]*\d+\. .*(?:\n|$))+)/g, (m, block) => {
    const items = block.trim().split('\n').map(l => '<li>' + l.replace(/^\s*\d+\. /, '') + '</li>').join('');
    return '\n<ol>' + items + '</ol>\n';
  });
  // paragraphs
  const parts = s.split(/\n{2,}/).map(p => {
    const t = p.trim();
    if (!t) return '';
    if (/^<(h\d|ul|ol|blockquote|hr|table|pre)/.test(t)) return t;
    return '<p>' + t.replace(/\n/g, '<br>') + '</p>';
  }).join('');
  s = parts;
  // inline
  s = mdInlineBlock(s);
  // restore code blocks
  s = s.replace(/\u0000CB(\d+)\u0000/g, (m, i) => {
    const { lang, code } = codeBlocks[+i];
    return `<pre><button class="code-copy" data-code="${esc(code)}">copy</button><code>${esc(code.replace(/\n$/, ''))}</code></pre>`;
  });
  return s;
}
function mdInline(t) {
  return t
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<i>$2</i>');
}
function mdInlineBlock(s) {
  // apply inline markdown outside of already-built tags, roughly — good enough for chat
  return s
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
}

/* ================= views ================= */

function render() {
  renderTopbar();
  const stage = $('#stage');
  if (view === 'gallery') stage.replaceChildren(buildGallery());
  else if (view === 'chat') stage.replaceChildren(buildChat());
  else if (view === 'beam') stage.replaceChildren(buildBeam());
  renderDrawer();
}

function renderTopbar() {
  $('#btnBeam').classList.toggle('on', view === 'beam');
  $('#btnPersonas').classList.toggle('on', view === 'gallery');
}

/* ---------- gallery ---------- */

function buildGallery() {
  const wrap = el('div', 'gallery');
  const inner = el('div', 'gallery-inner');
  inner.appendChild(el('div', 'gallery-hero',
    `<h2>Choose a <em>mind</em>.</h2>
     <p>Fourteen personas, each a fully-drawn character with its own craft, voice and system prompt — carried verbatim from the original suite. Bring your own key; everything stays in your browser.</p>`));
  const grid = el('div', 'persona-grid');
  for (const pid of PERSONA_ORDER) {
    const p = PERSONAS[pid];
    const card = el('button', 'pcard');
    card.setAttribute('aria-label', `Chat with ${p.title}`);
    card.innerHTML = `
      <div class="row">${sigilSVG(pid, 46)}<div><h3>${esc(p.title)}</h3></div>${p.highlighted ? '<span class="hl">Featured</span>' : ''}</div>
      <p>${esc(p.description)}</p>
      ${p.examples?.length ? `<div class="ex"><b>e.g.</b> ${esc(p.examples[0])}</div>` : ''}
      <span class="go">Open chat →</span>`;
    card.onclick = () => startChat(pid);
    grid.appendChild(card);
  }
  inner.appendChild(grid);
  wrap.appendChild(inner);
  return wrap;
}

/* ---------- chat ---------- */

function newConversation(pid, systemOverride) {
  const p = PERSONAS[pid || DEFAULT_PERSONA];
  const c = {
    id: uid(), personaId: pid || DEFAULT_PERSONA,
    systemOverride: systemOverride ?? null,
    messages: [], created: Date.now(), updated: Date.now(), title: null,
  };
  state.conversations.unshift(c);
  save();
  return c;
}

function startChat(pid, systemOverride, prefill) {
  const c = newConversation(pid, systemOverride);
  convId = c.id; view = 'chat';
  render();
  if (prefill) { $('#input').value = prefill; $('#input').focus(); }
}

function personaOf(c) { return PERSONAS[c?.personaId] || PERSONAS[DEFAULT_PERSONA]; }

function buildChat() {
  const c = conv();
  const wrap = el('div', 'chatwrap');
  if (!c) { view = 'gallery'; return buildGallery(); }

  const scroll = el('div', 'chat-scroll');
  scroll.id = 'chatScroll';
  const inner = el('div', 'chat-inner');
  scroll.appendChild(inner);

  if (c.messages.length === 0) {
    const p = personaOf(c);
    const w = el('div', 'welcome');
    const exs = (p.examples || []).slice(0, 5);
    w.innerHTML = `
      <div class="sig-lg">${sigilSVG(c.personaId, 92)}</div>
      <h2>${esc(p.title)}</h2>
      <div class="d">${esc(p.description)}</div>
      <div class="ex-grid">${exs.map((e, i) => `<button class="ex" data-i="${i}">${esc(e)}</button>`).join('') || ''}</div>`;
    w.querySelectorAll('.ex').forEach(b => b.onclick = () => { $('#input').value = exs[+b.dataset.i]; $('#input').focus(); });
    inner.appendChild(w);
  } else {
    for (const m of c.messages) inner.appendChild(msgNode(m, c));
  }

  const zone = el('div', 'composer-zone');
  zone.appendChild(composerNode(c));
  const p = personaOf(c);
  zone.appendChild(el('div', 'hint', `Persona: <b style="color:var(--ink-dim)">${esc(p.title)}</b> · Model: ${esc(provider()?.label || '')} ${esc(provider()?.model || '')} · keys never leave this browser`));

  wrap.append(scroll, zone);
  requestAnimationFrame(() => { scroll.scrollTop = scroll.scrollHeight; });
  return wrap;
}

function composerNode(c) {
  const p = personaOf(c);
  const box = el('div', 'composer');
  const ta = el('textarea');
  ta.id = 'input'; ta.rows = 1; ta.setAttribute('aria-label', 'Message');
  ta.placeholder = `Message ${p.title}…`;
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, innerHeight * 0.44) + 'px'; };
  ta.addEventListener('input', grow);
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && innerWidth > 760) { e.preventDefault(); doSend(); }
  });
  const bar = el('div', 'bar');
  const who = el('button', 'who');
  who.innerHTML = `${sigilSVG(c.personaId, 19)} <b>${esc(p.title)}</b>`;
  who.title = 'Change persona';
  who.onclick = () => openPersonaSwitcher();
  bar.appendChild(who);
  bar.appendChild(el('div', 'spacer'));
  const send = el('button', 'sendbtn');
  send.id = 'sendBtn'; send.setAttribute('aria-label', 'Send');
  send.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4 21.85 12 3.4 3.6l-.01 6.53L15 12 3.39 13.87z"/></svg>';
  send.onclick = doSend;
  bar.appendChild(send);
  box.append(ta, bar);
  return box;
}

function msgNode(m, c) {
  const node = el('div', 'msg' + (m.role === 'user' ? ' user' : ''));
  const av = el('div', 'avatar');
  if (m.role === 'user') av.innerHTML = '<div class="you">YOU</div>';
  else av.innerHTML = sigilSVG(c.personaId, 34);
  const bubble = el('div', 'bubble');
  const who = el('div', 'who');
  who.innerHTML = (m.role === 'user' ? 'You' : esc(personaOf(c).title)) +
    (m.model ? `<span class="model">${esc(m.model)}</span>` : '') +
    (m.error ? `<span class="model" style="color:var(--err)">failed</span>` : '');
  const body = el('div', 'body');
  body.innerHTML = m.role === 'user' ? `<p>${esc(m.content).replace(/\n/g, '<br>')}</p>` : renderMarkdown(m.content);
  bubble.append(who, body);
  if (m.role === 'assistant' && !m.error) {
    const acts = el('div', 'acts');
    const cp = el('button', null, 'copy'); cp.onclick = () => { navigator.clipboard.writeText(m.content); toast('Copied'); };
    const rg = el('button', null, 'regenerate'); rg.onclick = () => regenerate();
    acts.append(cp, rg);
    bubble.appendChild(acts);
  }
  node.append(av, bubble);
  return node;
}

/* ---------- send / stream ---------- */

async function doSend() {
  const c = conv(); if (!c) return;
  const ta = $('#input');
  const text = ta.value.trim();
  if (!text) return;
  if (!hasKey(provider())) { openSettings(); toast('Add an API key first — settings'); return; }

  c.messages.push({ role: 'user', content: text, ts: Date.now() });
  if (!c.title) { c.title = text.slice(0, 48) + (text.length > 48 ? '…' : ''); }
  ta.value = ''; ta.style.height = 'auto';
  c.updated = Date.now(); save();

  render();
  await runCompletion(c);
}

async function runCompletion(c) {
  const p = provider();
  const scroll = $('#chatScroll');
  const inner = scroll.querySelector('.chat-inner');

  const m = { role: 'assistant', content: '', model: `${p.label} · ${p.model}`, ts: Date.now(), error: false };
  c.messages.push(m);

  const node = el('div', 'msg');
  node.innerHTML = `<div class="avatar">${sigilSVG(c.personaId, 34)}</div>
    <div class="bubble"><div class="who">${esc(personaOf(c).title)}<span class="model">${esc(m.model)}</span></div>
    <div class="body"><div class="thinking"><i></i><i></i><i></i></div></div></div>`;
  inner.appendChild(node);
  const body = node.querySelector('.body');

  const persona = personaOf(c);
  const sys = renderSystemMessage(c.systemOverride ?? persona.systemMessage);
  const msgs = [{ role: 'system', content: sys }, ...c.messages.slice(0, -1).map(x => ({ role: x.role, content: x.content }))];

  abortCtl = new AbortController();
  setSending(true);
  let got = false;
  try {
    for await (const chunk of streamChat(p.kind, p, msgs, { temperature: state.settings.temperature, maxTokens: state.settings.maxTokens })) {
      if (chunk && chunk.__usage) { m.usage = chunk.__usage; continue; }
      got = true;
      m.content += chunk;
      body.innerHTML = renderMarkdown(m.content) + '<span class="stream-caret"></span>';
      scroll.scrollTop = scroll.scrollHeight;
    }
    body.innerHTML = renderMarkdown(m.content);
  } catch (e) {
    if (e.name === 'AbortError') {
      body.innerHTML = renderMarkdown(m.content || '_stopped_');
      if (!m.content) m.error = true;
    } else {
      m.error = true;
      body.innerHTML = `<p style="color:var(--err)"><b>Request failed.</b> ${esc(e.message)}</p>
        <p style="color:var(--ink-faint);font-size:13px">Check the key, base URL and model in Settings. Browser CORS can also block some endpoints.</p>`;
    }
  } finally {
    abortCtl = null; setSending(false);
    c.updated = Date.now(); save();
    render(); // rebuild for acts + persisted state
  }
  void got;
}

function regenerate() {
  const c = conv(); if (!c) return;
  // drop trailing assistant message(s)
  while (c.messages.length && c.messages[c.messages.length - 1].role === 'assistant') c.messages.pop();
  save(); render(); runCompletion(c);
}

function setSending(on) {
  const send = $('#sendBtn'); if (!send) return;
  if (on) {
    send.className = 'stopbtn'; send.setAttribute('aria-label', 'Stop');
    send.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
    send.onclick = () => abortCtl?.abort();
  } else {
    send.className = 'sendbtn'; send.setAttribute('aria-label', 'Send');
    send.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4 21.85 12 3.4 3.6l-.01 6.53L15 12 3.39 13.87z"/></svg>';
    send.onclick = doSend;
  }
}

/* ---------- beam ---------- */

function buildBeam() {
  const wrap = el('div', 'chatwrap');
  const zone = el('div', 'composer-zone');
  const box = el('div', 'composer');
  const ta = el('textarea'); ta.id = 'beamInput'; ta.rows = 1; ta.setAttribute('aria-label', 'Beam prompt');
  ta.placeholder = 'One prompt → every selected model, side by side…';
  box.appendChild(ta);
  const bar = el('div', 'bar');
  const sel = el('div', 'who'); sel.id = 'beamSel';
  bar.appendChild(sel); bar.appendChild(el('div', 'spacer'));
  const send = el('button', 'sendbtn'); send.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4 21.85 12 3.4 3.6l-.01 6.53L15 12 3.39 13.87z"/></svg>';
  send.onclick = runBeam;
  bar.appendChild(send);
  box.appendChild(bar);
  zone.appendChild(box);
  zone.appendChild(el('div', 'hint', 'Beam: the suite\'s signature side-by-side comparison. Pick lanes in Settings → Beam lanes.'));

  const grid = el('div', 'beam-grid');
  grid.id = 'beamGrid';
  wrap.append(grid, zone);
  renderBeamLanes(wrap);
  return wrap;
}

function beamLanes() { return state.settings.providers.filter(p => beamSel.includes(p.id)); }

function renderBeamLanes(root) {
  const q = (sel) => (root || document).querySelector(sel);
  const sel = q('#beamSel'); if (!sel) return;
  const lanes = beamLanes();
  sel.innerHTML = lanes.length
    ? `<b>${lanes.length} lane${lanes.length > 1 ? 's' : ''}</b> · ${lanes.map(l => esc(l.label)).join(' · ')}`
    : 'no lanes selected';
  const grid = q('#beamGrid');
  if (grid && !grid.childElementCount) {
    grid.style.setProperty('--beam-cols', Math.max(1, lanes.length));
    grid.innerHTML = lanes.map(l => `<div class="beam-col"><div class="head"><span class="dot"></span>${esc(l.label)} <span class="model">${esc(l.model)}</span></div><div class="out" id="out-${l.id}"><span style="color:var(--ink-faint);font-size:13px">awaiting prompt…</span></div></div>`).join('');
  }
}

async function runBeam() {
  const ta = $('#beamInput');
  const text = ta.value.trim(); if (!text) return;
  const lanes = beamLanes().filter(hasKey);
  if (!lanes.length) { openSettings(); toast('Pick beam lanes with keys in Settings'); return; }
  const grid = $('#beamGrid');
  grid.style.setProperty('--beam-cols', Math.max(1, lanes.length));
  grid.innerHTML = lanes.map(l => `<div class="beam-col"><div class="head"><span class="dot"></span>${esc(l.label)} <span class="model">${esc(l.model)}</span></div><div class="out" id="out-${l.id}"><div class="thinking"><i></i><i></i><i></i></div></div></div>`).join('');
  ta.value = '';

  const persona = personaOf(conv()) || PERSONAS[DEFAULT_PERSONA];
  const sys = renderSystemMessage(persona.systemMessage);
  const msgs = [{ role: 'system', content: sys }, { role: 'user', content: text }];

  await Promise.all(lanes.map(async l => {
    const out = $('#out-' + l.id);
    let acc = '';
    try {
      for await (const chunk of streamChat(l.kind, l, msgs, { temperature: state.settings.temperature, maxTokens: state.settings.maxTokens })) {
        if (chunk && chunk.__usage) continue;
        acc += chunk;
        out.innerHTML = renderMarkdown(acc) + '<span class="stream-caret"></span>';
      }
      out.innerHTML = renderMarkdown(acc);
    } catch (e) {
      out.innerHTML = `<p style="color:var(--err);font-size:13px">${esc(e.message)}</p>`;
    }
  }));
}

/* ---------- drawer: history + personas ---------- */

function renderDrawer() {
  const body = $('#drawerBody');
  body.replaceChildren();
  const histBtn = $('#chipHist'), perBtn = $('#chipPersonas');
  histBtn.classList.toggle('on', drawerTab === 'hist');
  perBtn.classList.toggle('on', drawerTab === 'personas');

  if (drawerTab === 'personas') {
    for (const pid of PERSONA_ORDER) {
      const p = PERSONAS[pid];
      const b = el('button', 'hist-item');
      b.innerHTML = `${sigilSVG(pid, 30)}<div class="meta"><div class="t">${esc(p.title)}</div><div class="s">${esc(p.description)}</div></div>`;
      b.onclick = () => { closeDrawer(); startChat(pid); };
      body.appendChild(b);
    }
    const mk = el('button', 'hist-item');
    mk.innerHTML = `<div class="avatar" style="width:30px;height:30px;border-radius:9px;background:var(--grad);display:grid;place-items:center;color:#071018;font-weight:800">+</div>
      <div class="meta"><div class="t">Custom persona</div><div class="s">Write your own system prompt</div></div>`;
    mk.onclick = () => { closeDrawer(); openCustomPersona(); };
    body.appendChild(mk);
  } else {
    if (!state.conversations.length) {
      body.appendChild(el('div', null, '<p style="color:var(--ink-faint);padding:16px;font-size:13.5px">No conversations yet — pick a persona to begin.</p>'));
    }
    for (const c of state.conversations) {
      const b = el('div', 'hist-item' + (c.id === convId && view === 'chat' ? ' on' : ''));
      const item = el('button', null);
      item.style.cssText = 'flex:1;min-width:0;display:flex;gap:10px;align-items:center;text-align:left';
      item.innerHTML = `${sigilSVG(c.personaId, 30)}<div class="meta"><div class="t">${esc(c.title || personaOf(c).title)}</div><div class="s">${esc(personaOf(c).title)} · ${c.messages.length} msg</div></div>`;
      item.onclick = () => { convId = c.id; view = 'chat'; closeDrawer(); render(); };
      const del = el('button', 'del', '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Z"/></svg>');
      del.setAttribute('aria-label', 'Delete conversation');
      del.onclick = e => {
        e.stopPropagation();
        state.conversations = state.conversations.filter(x => x.id !== c.id);
        save();
        if (convId === c.id) { convId = state.conversations[0]?.id || null; view = convId ? 'chat' : 'gallery'; }
        render();
      };
      b.append(item, del);
      body.appendChild(b);
    }
  }
}
let drawerTab = 'hist';
function openDrawer(tab) { drawerTab = tab; $('#drawer').classList.add('open'); renderDrawer(); }
function closeDrawer() { $('#drawer').classList.remove('open'); }

function openPersonaSwitcher() { openDrawer('personas'); }

/* ---------- custom persona ---------- */

function openCustomPersona() {
  editingPersona = { systemMessage: '', title: 'Custom' };
  $('#sheetTitle').textContent = 'Custom persona';
  $('#sheetBody').replaceChildren();
  const f = el('div', 'field', `<label>System prompt</label>
    <textarea id="cpText" rows="7" placeholder="You are…"></textarea>
    <div class="help">Big-AGI macros work: {{LLM.Cutoff}} {{LocaleNow}} {{RenderMermaid}} {{PreferTables}} …</div>`);
  const row = el('div', 'btn-row');
  const go = el('button', 'btn primary', 'Start chat');
  go.onclick = () => {
    const t = $('#cpText').value.trim();
    if (!t) { toast('Write a system prompt first'); return; }
    closeSheet();
    startChat('Custom', t);
  };
  row.appendChild(go);
  $('#sheetBody').append(f, row);
  $('#sheetWrap').classList.add('open');
}
function closeSheet() { $('#sheetWrap').classList.remove('open'); }

/* ---------- settings ---------- */

function openSettings() {
  $('#sheetTitle').textContent = 'Settings';
  const body = $('#sheetBody');
  body.replaceChildren();

  body.appendChild(el('div', 'notice',
    '<b>Keys live in your browser only</b> (localStorage) and are sent straight to the provider you configure. This app has no backend. Use restricted / spend-capped keys.'));

  const gen = el('div');
  gen.innerHTML = `
    <div class="two">
      <div class="field"><label>Temperature</label><input type="range" id="stTemp" min="0" max="2" step="0.05" value="${state.settings.temperature}"><div class="help" id="stTempV">${state.settings.temperature}</div></div>
      <div class="field"><label>Max tokens</label><input type="number" id="stMax" min="128" max="131072" step="128" value="${state.settings.maxTokens}"><div class="help">Response cap per message</div></div>
    </div>`;
  gen.querySelector('#stTemp').oninput = e => { state.settings.temperature = +e.target.value; gen.querySelector('#stTempV').textContent = e.target.value; save(); };
  gen.querySelector('#stMax').oninput = e => { state.settings.maxTokens = +e.target.value || 2048; save(); };
  body.appendChild(gen);

  const head = el('div', 'field', `<label>Providers — default lane + beam lanes</label>`);
  body.appendChild(head);

  for (const p of state.settings.providers) {
    const card = el('div', 'provider-card' + (hasKey(p) ? ' live' : ''));
    const isDef = p.id === state.settings.activeProviderId;
    const inBeam = beamSel.includes(p.id);
    card.innerHTML = `
      <div class="pc-head"><span class="st"></span><b>${esc(p.label)}</b>
        ${isDef ? '<span class="badge def">default</span>' : ''}
        <span class="spacer"></span>
        <button class="btn" style="min-height:34px;padding:6px 12px;font-size:12.5px" data-act="def">set default</button>
        <button class="btn ${inBeam ? 'primary' : ''}" style="min-height:34px;padding:6px 12px;font-size:12.5px" data-act="beam">${inBeam ? '✓ beam lane' : '+ beam lane'}</button>
      </div>
      <div class="two">
        <div class="field" style="margin:0"><input type="password" placeholder="API key (stays local)" value="${esc(p.key)}" data-f="key" autocomplete="off"></div>
        <div class="field" style="margin:0"><input placeholder="model id" value="${esc(p.model)}" data-f="model"></div>
      </div>
      <div class="field" style="margin:8px 0 0"><input placeholder="base URL" value="${esc(p.baseUrl)}" data-f="baseUrl">
        <div class="help">${p.kind === 'openai' ? 'OpenAI-compatible endpoint' : p.kind === 'anthropic' ? 'Anthropic Messages API' : 'Google Gemini API'}</div></div>`;
    card.querySelector('[data-act="def"]').onclick = () => { state.settings.activeProviderId = p.id; save(); openSettings(); };
    card.querySelector('[data-act="beam"]').onclick = () => {
      beamSel = beamSel.filter(x => x !== p.id);
      if (!inBeam && beamSel.length < 3) beamSel.push(p.id);
      else if (!inBeam) { toast('Max 3 beam lanes'); }
      save(); openSettings();
    };
    card.querySelectorAll('[data-f]').forEach(inp => {
      inp.onchange = () => { p[inp.dataset.f] = inp.value.trim(); save(); };
    });
    body.appendChild(card);
  }

  const dataRow = el('div', 'btn-row');
  const exp = el('button', 'btn', 'Export all data (JSON)');
  exp.onclick = () => download('big-agi-v2-export-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(state, null, 1));
  const imp = el('button', 'btn', 'Import');
  imp.onclick = () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
    inp.onchange = async () => {
      try {
        const j = JSON.parse(await inp.files[0].text());
        if (!j.settings || !j.conversations) throw new Error('not a v2 export');
        state = j; save(); toast('Imported'); render(); closeSheet();
      } catch (e) { toast('Import failed: ' + e.message); }
    };
    inp.click();
  };
  const md = el('button', 'btn', 'Export chat as Markdown');
  md.onclick = () => {
    const c = conv(); if (!c) { toast('No active conversation'); return; }
    const persona = personaOf(c);
    const text = `# ${c.title || persona.title}\n\n_${persona.title} — ${persona.description}_\n\n` +
      c.messages.map(m => (m.role === 'user' ? '## You\n\n' : `## ${persona.title}\n\n`) + m.content + '\n').join('\n');
    download((c.title || 'chat').replace(/[^\w-]+/g, '_').slice(0, 40) + '.md', text);
  };
  const wipe = el('button', 'btn danger', 'Wipe local data');
  wipe.onclick = () => {
    if (!confirm('Delete ALL conversations and keys from this browser?')) return;
    localStorage.removeItem(LS_KEY); state = load() || { settings: { providers: structuredClone(DEFAULT_PROVIDERS), activeProviderId: 'openai', temperature: 0.7, maxTokens: 2048 }, conversations: [] };
    convId = null; view = 'gallery'; save(); render(); closeSheet(); toast('Wiped');
  };
  dataRow.append(exp, imp, md, wipe);
  body.appendChild(dataRow);

  $('#sheetWrap').classList.add('open');
}

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/octet-stream' }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- code copy delegation ---------- */

document.addEventListener('click', e => {
  const b = e.target.closest('.code-copy');
  if (b) { navigator.clipboard.writeText(b.dataset.code || ''); b.textContent = 'copied'; setTimeout(() => b.textContent = 'copy', 1200); }
});

/* ---------- boot ---------- */

if (!beamSel.length) { beamSel = ['openai', 'anthropic'].filter(id => state.settings.providers.some(p => p.id === id)); }
if (state.conversations.length && !convId) { convId = state.conversations[0].id; view = 'chat'; }
render();

$('#btnMenu').onclick = () => openDrawer(drawerTab);
$('#chipHist').onclick = () => { drawerTab = 'hist'; renderDrawer(); };
$('#chipPersonas').onclick = () => { drawerTab = 'personas'; renderDrawer(); };
$('#drawer').onclick = e => { if (e.target.id === 'drawer') closeDrawer(); };
$('#btnPersonas').onclick = () => { view = 'gallery'; render(); };
$('#btnNew').onclick = () => openDrawer('personas');
$('#btnBeam').onclick = () => { view = view === 'beam' ? (convId ? 'chat' : 'gallery') : 'beam'; render(); };
$('#btnSettings').onclick = openSettings;
$('#sheetWrap').onclick = e => { if (e.target.id === 'sheetWrap') closeSheet(); };

