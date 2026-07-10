'use strict';

/**
 * The 3-step Ticket Whisperer pipeline: classify -> retrieve -> draft.
 * Every AI call is routed through the Mesh API gateway (lib/mesh.js).
 */

const fs = require('node:fs');
const path = require('node:path');
const mesh = require('./mesh');
const pricing = require('./pricing');

// Models (overridable via env)
const CLASSIFY_MODEL = process.env.CLASSIFY_MODEL || 'openai/gpt-4o-mini';
const EMBED_MODEL = process.env.EMBED_MODEL || 'openai/text-embedding-3-small';
const DRAFT_MODEL = process.env.DRAFT_MODEL || 'anthropic/claude-sonnet-4.6';
// Used ONLY for the cost-comparison math ("what would this have cost on a premium model") — never called.
const PREMIUM_MODEL = process.env.PREMIUM_MODEL || 'openai/gpt-5.5';

const KB_PATH = process.env.KB_PATH || path.join(__dirname, '..', 'data', 'knowledge-base.json');

const CATEGORIES = [
  'Order Management',
  'Inventory',
  'Pricing',
  'Integration',
  'Authentication',
  'UI/UX',
  'Performance',
  'Other',
];

// ---------------------------------------------------------------------------
// Knowledge base
// ---------------------------------------------------------------------------

let knowledgeBase = [];
let kbEmbeddingsPromise = null; // lazy, cached in memory after first successful embed (any key)

function loadKnowledgeBase() {
  try {
    const raw = fs.readFileSync(KB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('knowledge base is not a JSON array');
    knowledgeBase = parsed;
    console.log(`[pipeline] Loaded ${knowledgeBase.length} knowledge base entries from ${KB_PATH}`);
  } catch (err) {
    knowledgeBase = [];
    console.warn(
      `[pipeline] Knowledge base not available at ${KB_PATH} (${err.message}). ` +
        'Starting with an empty KB — retrieval will return no matches.'
    );
  }
  // Invalidate cached embeddings if the KB was (re)loaded.
  kbEmbeddingsPromise = null;
}

/**
 * Embed all KB entries (title + problem) once; cached in memory.
 * Resolves to { vectors: number[][], tokens: number } where tokens is the
 * embedding token count reported by the API for the KB batch (charged once).
 */
function getKbEmbeddings(apiKey) {
  if (!kbEmbeddingsPromise) {
    kbEmbeddingsPromise = (async () => {
      const inputs = knowledgeBase.map((e) => `${e.title}\n${e.problem}`);
      const res = await mesh.embed({ model: EMBED_MODEL, input: inputs }, apiKey);
      const vectors = res.data
        .slice()
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
        .map((d) => d.embedding);
      const tokens = (res.usage && (res.usage.prompt_tokens ?? res.usage.total_tokens)) || 0;
      return { vectors, tokens };
    })();
    // If embedding the KB fails, allow a retry on the next request.
    kbEmbeddingsPromise.catch(() => {
      kbEmbeddingsPromise = null;
    });
  }
  return kbEmbeddingsPromise;
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse model output as JSON, tolerating markdown fences and surrounding prose. */
function parseJsonLoose(text) {
  if (typeof text !== 'string') throw new Error('model returned no text');
  let t = text.trim();
  // Strip ```json ... ``` fences
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch {
    // Fall back to the outermost {...} or [...] block
    const start = t.search(/[[{]/);
    if (start !== -1) {
      const open = t[start];
      const close = open === '{' ? '}' : ']';
      const end = t.lastIndexOf(close);
      if (end > start) return JSON.parse(t.slice(start, end + 1));
    }
    throw new Error(`could not parse model output as JSON: ${t.slice(0, 200)}`);
  }
}

function usageOf(res) {
  const u = (res && res.usage) || {};
  return {
    prompt_tokens: u.prompt_tokens || 0,
    completion_tokens: u.completion_tokens || 0,
  };
}

function contentOf(res) {
  return res?.choices?.[0]?.message?.content ?? '';
}

// ---------------------------------------------------------------------------
// Pipeline steps
// ---------------------------------------------------------------------------

async function classifyStep(ticket, apiKey) {
  const system = [
    'You are a support ticket triage engine. Analyze the customer ticket and respond with STRICT JSON only — no markdown, no explanation.',
    'Schema:',
    '{',
    `  "category": one of ${JSON.stringify(CATEGORIES)},`,
    '  "urgency": "low" | "medium" | "high" | "critical",',
    '  "sentiment": "calm" | "frustrated" | "angry" | "neutral",',
    '  "summary": "one sentence summary of the issue"',
    '}',
  ].join('\n');

  const res = await mesh.chat(
    {
      model: CLASSIFY_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: ticket },
      ],
      temperature: 0.1,
    },
    apiKey
  );

  const parsed = parseJsonLoose(contentOf(res));
  const result = {
    category: CATEGORIES.includes(parsed.category) ? parsed.category : 'Other',
    urgency: ['low', 'medium', 'high', 'critical'].includes(parsed.urgency)
      ? parsed.urgency
      : 'medium',
    sentiment: ['calm', 'frustrated', 'angry', 'neutral'].includes(parsed.sentiment)
      ? parsed.sentiment
      : 'neutral',
    summary: String(parsed.summary || '').trim(),
  };
  return { result, usage: usageOf(res), model: CLASSIFY_MODEL };
}

/**
 * Retrieval via Mesh embeddings + cosine similarity. If the embeddings call
 * fails, falls back to asking the classify model to score the matches.
 */
async function retrieveStep(ticket, apiKey) {
  if (knowledgeBase.length === 0) {
    return {
      result: { matches: [], method: 'none' },
      usage: { prompt_tokens: 0, completion_tokens: 0 },
      model: EMBED_MODEL,
    };
  }

  try {
    const kb = await getKbEmbeddings(apiKey);
    const kbTokens = kb.charged ? 0 : kb.tokens; // charge the KB batch only once
    kb.charged = true;

    const res = await mesh.embed({ model: EMBED_MODEL, input: ticket }, apiKey);
    const ticketVec = res.data[0].embedding;
    const ticketTokens =
      (res.usage && (res.usage.prompt_tokens ?? res.usage.total_tokens)) || 0;

    const scored = knowledgeBase
      .map((entry, i) => ({ entry, similarity: cosineSimilarity(ticketVec, kb.vectors[i]) }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3)
      .map(({ entry, similarity }) => ({
        id: entry.id,
        title: entry.title,
        resolution: entry.resolution,
        similarity: Math.round(similarity * 100) / 100,
      }));

    return {
      result: { matches: scored, method: 'embeddings' },
      usage: { prompt_tokens: kbTokens + ticketTokens, completion_tokens: 0 },
      model: EMBED_MODEL,
    };
  } catch (err) {
    console.warn(
      `[pipeline] Embeddings retrieval failed (${err.message}); falling back to LLM similarity scoring.`
    );
    return retrieveViaLlm(ticket, apiKey);
  }
}

/** Fallback retrieval: the classify model scores each KB entry 0..1. */
async function retrieveViaLlm(ticket, apiKey) {
  const entries = knowledgeBase.map((e) => ({ id: e.id, title: e.title, problem: e.problem }));
  const system = [
    'You score how similar known support issues are to a new ticket.',
    'Respond with STRICT JSON only: an array of {"id": string, "similarity": number between 0 and 1} for EVERY entry provided. No markdown.',
  ].join('\n');

  const res = await mesh.chat(
    {
      model: CLASSIFY_MODEL,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: `New ticket:\n${ticket}\n\nKnown issues:\n${JSON.stringify(entries)}`,
        },
      ],
      temperature: 0,
    },
    apiKey
  );

  const scores = parseJsonLoose(contentOf(res));
  const byId = new Map(knowledgeBase.map((e) => [String(e.id), e]));
  const matches = (Array.isArray(scores) ? scores : [])
    .filter((s) => byId.has(String(s.id)))
    .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
    .slice(0, 3)
    .map((s) => {
      const entry = byId.get(String(s.id));
      return {
        id: entry.id,
        title: entry.title,
        resolution: entry.resolution,
        similarity: Math.round(Math.min(Math.max(s.similarity || 0, 0), 1) * 100) / 100,
      };
    });

  return {
    result: { matches, method: 'llm-fallback' },
    usage: usageOf(res),
    model: CLASSIFY_MODEL,
  };
}

async function draftStep(ticket, classification, matches, apiKey) {
  const system = [
    'You are a senior support engineer writing responses for a B2B SaaS product.',
    'Respond with STRICT JSON only — no markdown, no explanation. Schema:',
    '{',
    '  "customer_reply": "a professional, empathetic email body. Start with \\"Hi there,\\". Never use placeholders like [Name] or [Company]. Address the customer\'s issue concretely using the matched resolutions when relevant.",',
    '  "internal_note": "2-3 sentences for the assigned support engineer: probable root cause and suggested fix, referencing matched knowledge base ids (e.g. KB-1) when applicable."',
    '}',
  ].join('\n');

  const user = [
    `Ticket:\n${ticket}`,
    `Classification:\n${JSON.stringify(classification)}`,
    `Top knowledge base matches:\n${JSON.stringify(matches)}`,
  ].join('\n\n');

  const res = await mesh.chat(
    {
      model: DRAFT_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.4,
    },
    apiKey
  );

  const parsed = parseJsonLoose(contentOf(res));
  const result = {
    customer_reply: String(parsed.customer_reply || '').trim(),
    internal_note: String(parsed.internal_note || '').trim(),
  };
  return { result, usage: usageOf(res), model: DRAFT_MODEL };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

const STEP_LABELS = {
  classify: 'Classifying ticket',
  retrieve: 'Searching knowledge base',
  draft: 'Drafting response',
};

/**
 * Run the full pipeline, emitting SSE-style events through `emit(event, data)`.
 * Throws are handled by the caller (server.js emits the `error` event).
 * @param {string} [apiKey] per-request Mesh key override (falls back to MESH_API_KEY)
 */
async function runPipeline(ticket, emit, apiKey) {
  const startedAt = Date.now();
  let totalCost = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  const modelsUsed = [];

  async function runStep(step, plannedModel, fn) {
    emit('step_start', { step, model: plannedModel, label: STEP_LABELS[step] });
    const t0 = Date.now();
    const { result, usage, model } = await fn();
    const ms = Date.now() - t0;
    const cost = pricing.costUsd(model, usage.prompt_tokens, usage.completion_tokens);

    totalCost += cost;
    totalPromptTokens += usage.prompt_tokens;
    totalCompletionTokens += usage.completion_tokens;
    if (!modelsUsed.includes(model)) modelsUsed.push(model);

    emit('step_done', { step, model, ms, usage, cost_usd: cost, result });
    return result;
  }

  const classification = await runStep('classify', CLASSIFY_MODEL, () =>
    classifyStep(ticket, apiKey)
  );
  const retrieval = await runStep('retrieve', EMBED_MODEL, () => retrieveStep(ticket, apiKey));
  await runStep('draft', DRAFT_MODEL, () =>
    draftStep(ticket, classification, retrieval.matches, apiKey)
  );

  // What the same token volume would have cost on the premium model (never called).
  const premiumCost = pricing.costUsd(PREMIUM_MODEL, totalPromptTokens, totalCompletionTokens);
  const savingsPct = premiumCost > 0 ? Math.round((1 - totalCost / premiumCost) * 100) : 0;

  emit('done', {
    total_ms: Date.now() - startedAt,
    total_cost_usd: pricing.round6(totalCost),
    premium_cost_usd: premiumCost,
    savings_pct: savingsPct,
    models_used: modelsUsed,
  });
}

module.exports = {
  runPipeline,
  loadKnowledgeBase,
  CLASSIFY_MODEL,
  EMBED_MODEL,
  DRAFT_MODEL,
  PREMIUM_MODEL,
  KB_PATH,
};
