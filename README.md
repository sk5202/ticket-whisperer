# Ticket Whisperer

**AI support-ticket triage that uses the right model for the right job — and proves the savings in real time.**

> 🏆 Built for the **Mesh API Hackathon (July 5–12, 2026)**

Paste a raw support ticket. Ticket Whisperer classifies it, finds the most similar solved tickets from your knowledge base, and drafts both a customer-facing reply and an internal triage note — routing every step through [Mesh API](https://api.meshapi.ai/v1) to the cheapest model that can do that job well. A live cost meter shows exactly what the analysis cost versus running the whole pipeline on a flagship model.

---

## The Problem

Support triage is slow and expensive in two ways:

1. **Human time.** Tier-1 agents spend minutes per ticket figuring out what it's about, whether it's been solved before, and how to respond — before writing a single word.
2. **Model waste.** Teams that automate this typically point one flagship LLM at everything. But classification is a cheap-model task, retrieval is an embeddings task, and only the final customer-facing draft actually needs premium reasoning. Paying flagship prices for all three is burning money.

Ticket Whisperer fixes both: it automates the triage pipeline **and** routes each step to the smallest model that does it well.

## How It Works

```
 ┌─────────────────────┐      ┌──────────────────────────┐      ┌───────────────────────────┐
 │  1. CLASSIFY        │      │  2. RETRIEVE             │      │  3. DRAFT                 │
 │                     │      │                          │      │                           │
 │  openai/            │ ───► │  openai/                 │ ───► │  anthropic/               │
 │  gpt-4o-mini        │      │  text-embedding-3-small  │      │  claude-sonnet-4.6        │
 │                     │      │                          │      │                           │
 │  Category, urgency, │      │  Semantic search over    │      │  Customer reply draft +   │
 │  sentiment — a      │      │  18 solved tickets in    │      │  internal triage note,    │
 │  cheap, fast model  │      │  the knowledge base —    │      │  grounded in the matched  │
 │  is all this needs  │      │  embeddings, not chat    │      │  resolutions — the ONLY   │
 │                     │      │                          │      │  step worth premium $$$   │
 └─────────────────────┘      └──────────────────────────┘      └───────────────────────────┘
              └──────────── every call routed through Mesh API ────────────┘
                     one gateway · one key · per-call cost tracking
```

- **Step 1 — Classify** (`openai/gpt-4o-mini`): extracts category, urgency, and sentiment as structured JSON. A frontier model adds nothing here except cost.
- **Step 2 — Retrieve** (`openai/text-embedding-3-small`): embeds the ticket and cosine-matches it against pre-embedded solved tickets from `data/knowledge-base.json`. Fractions of a cent per call.
- **Step 3 — Draft** (`anthropic/claude-sonnet-4.6`): writes the empathetic customer reply and a technical internal note, grounded in the retrieved resolutions. This is the one output a human customer reads — the one place premium quality pays for itself.

## Why Mesh API

- **One API, 500+ models.** OpenAI, Anthropic, and hundreds more behind a single OpenAI-compatible endpoint. Our three-provider-model pipeline is one base URL and one key.
- **Per-call cost transparency.** The app pulls live pricing from Mesh's `/models` endpoint and computes the **real cost of every pipeline step** from actual token usage — that's what powers the on-screen cost meter and the "saved vs flagship" comparison. No hardcoded price tables.
- **Instant model swapping.** Every step's model is an env var. Want to try a different classifier or drafter? Change one line in `.env` and restart — no code changes, no new SDKs.

## Quick Start

```bash
npm install
cp .env.example .env    # optional — you can also paste your key in the UI instead
npm start
```

Open **http://localhost:3000**, paste your **Mesh API key** in the 🔑 field (it stays in your browser's localStorage and is sent only to your local server — never stored or logged), then paste a ticket (or use a sample) and watch the pipeline light up.

> **For judges/reviewers:** no `.env` setup needed — just `npm install && npm start` and paste your own Mesh key directly on the page.

## Architecture

- **Node.js / Express** backend — thin orchestrator, no framework bloat.
- **Zero database.** Fully stateless: the knowledge base is a JSON file (`data/knowledge-base.json`) embedded on the fly at startup via Mesh embeddings and held in memory.
- **Single-file frontend** with **SSE streaming** — each pipeline stage streams its status, output, and cost to the browser as it happens, driving the live pipeline animation and cost meter.
- **All AI traffic through Mesh** (`https://api.meshapi.ai/v1`) using the standard OpenAI-compatible chat and embeddings interfaces.

## Cost Example (illustrative)

| Step | Model via Mesh | Approx. cost / analysis |
|---|---|---|
| Classify | `openai/gpt-4o-mini` | ~$0.0001 |
| Retrieve | `openai/text-embedding-3-small` | ~$0.00001 |
| Draft | `anthropic/claude-sonnet-4.6` | ~$0.0009 |
| **Smart-routed total** | | **~$0.001** |
| Flagship-only (all 3 steps on a premium model) | | ~$0.02 |
| **Savings** | | **~95%** |

At 1,000 tickets/day, that's the difference between ~$1/day and ~$20/day — same output quality where it matters. The app computes the real numbers per run from live Mesh pricing; the table above is illustrative.

## Security Note

`.env` is gitignored. No API keys live anywhere in this repository — bring your own `MESH_API_KEY` via `.env.example`.

## License

MIT — see [LICENSE](LICENSE).
