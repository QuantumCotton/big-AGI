// big-AGI v2 — streaming chat adapters, browser-native, zero backend.
// Supports: any OpenAI-compatible endpoint (OpenAI, OpenRouter, Groq, Together,
// Ollama, Z.ai, LM Studio...), Anthropic, Google Gemini. SSE streaming via fetch.

async function* sseLines(res) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).replace(/\r$/, '');
      buf = buf.slice(nl + 1);
      if (line.startsWith('data:')) yield line.slice(5).trim();
      else if (line.startsWith('event:') || line.startsWith(':') || line === '') { /* skip */ }
    }
  }
}

async function assertOk(res, provider) {
  if (res.ok) return;
  let detail = '';
  try { const t = await res.text(); detail = t.slice(0, 400); } catch {}
  const err = new Error(`${provider} HTTP ${res.status}${detail ? ' — ' + detail : ''}`);
  err.status = res.status;
  throw err;
}

/* ---------------- OpenAI-compatible ---------------- */
async function* streamOpenAI(cfg, messages, opts) {
  const base = (cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const res = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cfg.key ? { Authorization: 'Bearer ' + cfg.key } : {}),
      ...(cfg.extraHeaders || {}),
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      stream: true,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
    }),
  });
  await assertOk(res, cfg.label || 'provider');
  let usage = null;
  for await (const data of sseLines(res)) {
    if (data === '[DONE]') break;
    try {
      const j = JSON.parse(data);
      const d = j.choices?.[0]?.delta;
      if (d?.content) yield d.content;
      if (j.usage) usage = j.usage;
    } catch { /* partial json line; ignore */ }
  }
  if (usage) yield { __usage: usage };
}

/* ---------------- Anthropic ---------------- */
async function* streamAnthropic(cfg, messages, opts) {
  const base = (cfg.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const rest = messages.filter(m => m.role !== 'system');
  const res = await fetch(base + '/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: cfg.model,
      system: system || undefined,
      messages: rest,
      stream: true,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
    }),
  });
  await assertOk(res, 'Anthropic');
  for await (const data of sseLines(res)) {
    try {
      const j = JSON.parse(data);
      if (j.type === 'content_block_delta' && j.delta?.text) yield j.delta.text;
      if (j.type === 'message_delta' && j.usage) yield { __usage: j.usage };
    } catch {}
  }
}

/* ---------------- Google Gemini ---------------- */
async function* streamGemini(cfg, messages, opts) {
  const base = (cfg.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const res = await fetch(`${base}/models/${cfg.model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(cfg.key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      generationConfig: { temperature: opts.temperature, maxOutputTokens: opts.maxTokens },
    }),
  });
  await assertOk(res, 'Gemini');
  for await (const data of sseLines(res)) {
    try {
      const j = JSON.parse(data);
      const parts = j.candidates?.[0]?.content?.parts || [];
      for (const p of parts) if (p.text) yield p.text;
    } catch {}
  }
}

/* ---------------- facade ---------------- */
const STREAMERS = { openai: streamOpenAI, anthropic: streamAnthropic, gemini: streamGemini };

async function* streamChat(provider, cfg, messages, opts) {
  const fn = STREAMERS[provider];
  if (!fn) throw new Error(`Unknown provider kind "${provider}"`);
  yield* fn(cfg, messages, opts);
}

export { streamChat };
