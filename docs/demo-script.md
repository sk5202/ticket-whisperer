# Ticket Whisperer — Demo Video Script (2:30)

Target length: **2 minutes 30 seconds** (hackathon requires 2–3 min).
Setup before recording: app running at `http://localhost:3000`, browser full-screen, the angry stuck-order sample ticket copied to clipboard, cost meter reset (fresh page load).

---

## 0:00 – 0:20 — Hook: the problem

**On screen:** Title card or plain browser tab with the app not yet visible. Cut to your face or just voiceover.

**Narration:**

> "Every support team has the same two problems. First, triage is slow — an agent reads a ticket, guesses the category, digs for similar past cases, then finally starts typing. Second, teams that automate this throw one expensive flagship model at every single step. That's like sending a surgeon to take your temperature. This is Ticket Whisperer — and it fixes both."

## 0:20 – 0:40 — Show the UI + model badges

**On screen:** Switch to the app. Slowly mouse over the three pipeline stages and their model badges.

**Narration:**

> "Here's the app. One text box, and a three-stage pipeline: classify, retrieve, draft. Notice each stage has a model badge — GPT-4o-mini for classification, a tiny embedding model for retrieval, and Claude Sonnet only for the final customer-facing draft. All three run through one gateway: Mesh API. One endpoint, one key, five hundred plus models — and per-call pricing we pull live from Mesh's models endpoint."

## 0:40 – 1:40 — Run the angry stuck-order ticket

**On screen:** Paste the sample ticket and hit Analyze. Narrate each stage **as it lights up** — let the animation carry the pacing.

Sample ticket (paste this):

> *"This is the THIRD time I'm writing in. We placed 40 orders during our weekend sale and they are ALL still stuck in 'Processing'. Our warehouse can't ship anything, customers are screaming at us, and nobody from your team has responded. If this isn't fixed today we are done. Order sync to our ERP looks completely frozen."*

**Narration (stage 1 lights up):**

> "I'm pasting in a real-world nightmare: an angry customer, forty orders frozen in 'Processing', ERP sync dead. Stage one — classification. GPT-4o-mini tags it in about a second: category Order Management, urgency critical, sentiment… very angry. This is a cheap-model task, so we use a cheap model."

**Narration (stage 2 lights up):**

> "Stage two — retrieval. The ticket gets embedded with text-embedding-3-small and matched against our solved-ticket knowledge base. Top hit: a past case where the nightly ERP export was timing out and orders piled up in 'Processing' — with the exact fix that worked. That's institutional memory, for a hundredth of a cent."

**Narration (stage 3 lights up, draft streams in):**

> "Stage three — and only now do we bring in the premium model. Claude Sonnet streams out two things: an empathetic customer reply that acknowledges the frustration and commits to a fix, and an internal note telling the engineer exactly where to look — the export batch size and the connector timeout, straight from the matched resolution. The one output a customer actually reads is the one place we spend real money."

## 1:40 – 2:10 — Cost meter + savings punchline

**On screen:** Zoom or point to the cost meter and the savings percentage.

**Narration:**

> "Now look at the cost meter. This entire analysis — classification, retrieval, and a premium hand-written-quality draft — cost about a tenth of a cent. The meter also shows the counterfactual, computed from Mesh's live pricing: run all three steps on a flagship model and you'd pay around two cents. That's roughly 95 percent saved, on every single ticket, at identical quality where it counts. Right model for the right job — that's Mesh."

## 2:10 – 2:30 — Wrap

**On screen:** README on GitHub, quick scroll past the pipeline diagram.

**Narration:**

> "Ticket Whisperer: Node and Express, zero database, a JSON knowledge base embedded on the fly, one single-file frontend with live streaming — and every AI call through Mesh API. Next up: a Freshdesk webhook so tickets triage themselves on arrival, and a feedback loop that grows the knowledge base with every resolved case. Repo link below. Thanks for watching."

---

## Timing cheat sheet

| Segment | Time | Beat |
|---|---|---|
| Hook | 0:00–0:20 | Triage is slow; one-model-for-everything is wasteful |
| UI tour | 0:20–0:40 | Three stages, three model badges, one Mesh gateway |
| Live run | 0:40–1:40 | Paste angry ticket; narrate each stage as it lights up |
| Cost meter | 1:40–2:10 | ~$0.001 vs ~$0.02 — "right model for the right job — that's Mesh" |
| Wrap | 2:10–2:30 | Stack, repo, Freshdesk webhook + feedback loop next |

**Recording tips:** do one silent dry run so the pipeline is warm and timings are predictable; speak ~10% slower than feels natural; if the draft finishes streaming early, let it breathe for a beat before cutting to the cost meter.
