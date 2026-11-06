# big-AGI v2 — The Persona Suite

A ground-up rebuild of the QuantumCotton/big-AGI fork as a **zero-backend, single-page
AI suite** that runs entirely in the browser.

## What it is
- **14 character personas** — CodeCraft, Dr. Empirica Datum, Lord Vyrthur the Dragonborn
  Bard, Orion the galactic web guide, and 10 more — every system prompt, example prompt,
  and call starter carried **verbatim** from the original fork (`src/data.ts` @ 42d8062de;
  zero-loss verified programmatically).
- **BYO-key streaming chat** — works with any OpenAI-compatible endpoint (OpenAI,
  OpenRouter, Groq, Z.ai, Ollama, LM Studio), Anthropic, and Google Gemini. Keys are
  stored in `localStorage` and sent only to the provider you configure. No backend, no proxy, no telemetry.
- **Beam mode** — the suite's signature move: one prompt, up to 3 model lanes, streaming
  side by side.
- **History** — conversations persist locally; export/import everything as JSON; export
  any chat as Markdown.

## Run it
Static files — serve the directory any way you like:

    python3 -m http.server 8080 v2/

or just open `index.html` through any static host (deployed at the v2 URL in the upgrade
report). Note: opening via `file://` works in Firefox; some Chromium builds restrict
module imports on `file://`, so prefer http(s).

## Structure
    index.html    shell + top-level layout
    styles.css    "Obsidian Filament" design system (no framework, no CDN)
    personas.js   zero-loss persona corpus (extracted from the old src/data.ts)
    sigils.js     procedural SVG persona marks (deterministic per persona)
    adapters.js   streaming provider adapters (OpenAI-compatible / Anthropic / Gemini)
    app.js        app state, chat, beam, settings, storage, markdown renderer
    assets/       the one upstream persona image reused

## Persona prompt macros
The original personas use big-AGI template macros. v2 implements them:
`{{LLM.Cutoff}}` `{{LocaleNow}}` `{{Today}}` `{{RenderMermaid}}` `{{RenderPlantUML}}`
`{{RenderSVG}}` `{{PreferTables}}`.

## Design laws honored
- Mobile-first, dark `#0a0e14`, ≥44px touch targets, safe-area insets.
- No emoji-as-art: every persona gets a procedurally generated layered-SVG sigil.
- Self-contained: zero external requests except the LLM calls you configure.
