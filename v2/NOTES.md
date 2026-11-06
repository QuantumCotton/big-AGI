# big-AGI — STUDY NOTES (Step 1 + 2)

## What is this repo?
A private fork of **enricoros/big-AGI** (upstream v1.92, the `v2-dev` branch) — the well-known
open-source "AI suite for professionals": multi-vendor chat (15 vendors), Beams (multi-model
side-by-side), Calls (voice), personas, draw, news, diff, tokens. Next.js 15 + tRPC + Prisma +
MUI Joy + Dexie (client-side history). 5,335 commits upstream; Docker + Vercel deploy paths.

## Fork delta (QuantumCotton, 2 commits by WindSurf editor)
1. `74f85fe1c` Create netlify.toml (Next build config; no site name — never bound)
2. `42d8062de` "Enhanced AI personas with detailed descriptions and character profiles"
   — 474-line enrichment of `src/data.ts`: 14 personas, several with long character
   backstories (CodeCraft the Windows dev, Dr. Empirica Datum, Lord Vyrthur the Dragonborn
   Bard, Orion the galactic web guide, dual-personality Email Embellisher...).
   **This persona corpus is the fork's real content.**

## Old live URL
NONE. Fleet Netlify account holds 274 sites — zero with "agi"/"big" in the name.
README links big-agi.com (upstream's site, not this fork). Old = none.

## Who uses it / what for
Personal BYO-key AI workbench. The fork's angle: character-rich personas driving the chat.

## BEFORE grades (weighted = 75.4 -> 75)
| # | Metric | W | Score | Why |
|---|--------|---|-------|-----|
| 1 | Objective Fit | 15 | 72 | Superb suite as software, but the fleet fork was never deployed, and its one customization (personas) is data-only inside a mid-migration v2-dev branch |
| 2 | UI/UX & Visual Design | 15 | 78 | Genuinely polished MUI Joy app (upstream's strength) but generic MUI look, desktop-first density, nothing custom-branded |
| 3 | Feature Completeness | 12 | 88 | Chats, Beams, Calls, personas, draw, news, diff, tokens — huge surface, nearly all gated on vendor keys |
| 4 | Code Organization | 12 | 82 | Disciplined modules/apps/common layout across 5.3K commits; fork edits a root-level src/data.ts rather than the modules/persona lane |
| 5 | Mobile Experience | 10 | 68 | Responsive shell but chat-suite density is desktop-first; Calls was the mobile push |
| 6 | Performance & Loading | 10 | 70 | Heavy Next bundle + server cold starts; upstream does real perf work (dynamic imports) |
| 7 | Security Hygiene | 8 | 75 | No committed secrets (verified); BYO-keys-in-browser by design; optional basic-auth middleware shipped |
| 8 | Maintainability | 8 | 58 | 494-line edit inside an upstream-owned file = merge-conflict debt; ~700-package dep tree; pinned to a moving v2-dev branch |
| 9 | Accessibility | 5 | 74 | MUI gives solid defaults (focus, ARIA); not audited, no a11y statement |
| 10 | Documentation & Onboarding | 5 | 88 | Excellent README + docs/ from upstream; fork adds nothing |

Weighted = (72*15+78*15+88*12+82*12+68*10+70*10+75*8+58*8+74*5+88*5)/100 = 7544/100 = 75.4 -> **75**

## v2 direction (locked)
Zero-backend static SPA faithful to the fork's objective: **a persona-driven AI suite**.
- All 14 personas carried with ZERO loss (verified: 14 sysMsgs 22.3K chars, 60 examples, 55 starters verbatim)
- BYO-key streaming chat in-browser: OpenAI-compatible (OpenAI/OpenRouter/Groq/Ollama/ZAI via base URL), Anthropic, Google
- Beam mode (up to 3 lanes side-by-side) — big-AGI's signature, kept
- Procedural SVG sigils replace emoji; the one upstream persona image is reused
- Mobile-first obsidian-glass design, custom design language, no CDNs, no build step
