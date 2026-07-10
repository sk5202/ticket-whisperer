'use strict';

/**
 * DEV-ONLY mock of the Mesh API gateway (https://api.meshapi.ai/v1).
 * Lets you exercise the full app (pipeline, SSE, UI animation, cost meter)
 * without spending credits. Replicates Mesh's wire formats:
 *   GET  /v1/models           -> bare JSON array with pricing
 *   POST /v1/chat/completions -> OpenAI chat format + usage
 *   POST /v1/embeddings       -> OpenAI embeddings format + usage
 *
 * NOT used in production/demo — the real app always talks to Mesh.
 * Run via `npm run dev:mock` (see dev/start-with-mock.js).
 */

const http = require('node:http');

const MOCK_PORT = process.env.MOCK_MESH_PORT || 4001;

// Same ids the app uses, with realistic per-1M pricing so the cost meter works.
const MODELS = [
  { id: 'openai/gpt-4o-mini', prompt: '0.15', completion: '0.60' },
  { id: 'openai/text-embedding-3-small', prompt: '0.02', completion: '0' },
  { id: 'anthropic/claude-sonnet-4.6', prompt: '3.00', completion: '15.00' },
  { id: 'openai/gpt-5.5', prompt: '5.00', completion: '30.00' },
].map((m) => ({
  id: m.id,
  name: m.id,
  model_type: 'text',
  pricing: { prompt_usd_per_1m: m.prompt, completion_usd_per_1m: m.completion },
}));

const approxTokens = (s) => Math.max(1, Math.ceil(String(s).length / 4));

/** Deterministic pseudo-embedding: hashed bag of words, 64 dims.
 *  Similar texts share words -> similar vectors, so cosine ranking behaves sensibly. */
function pseudoEmbed(text) {
  const vec = new Array(64).fill(0);
  const words = String(text).toLowerCase().match(/[a-z0-9]+/g) || [];
  for (const w of words) {
    let h = 2166136261;
    for (let i = 0; i < w.length; i++) {
      h ^= w.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    vec[Math.abs(h) % 64] += 1;
  }
  const norm = Math.sqrt(vec.reduce((a, v) => a + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

function chatResponse(body) {
  const system = (body.messages.find((m) => m.role === 'system') || {}).content || '';
  const user = (body.messages.find((m) => m.role === 'user') || {}).content || '';
  let content;

  if (/triage engine/i.test(system)) {
    const angry = /urgent|angry|third time|asap|immediately|!{2,}/i.test(user);
    content = JSON.stringify({
      category: /stock|inventory|warehouse/i.test(user)
        ? 'Inventory'
        : /login|password|sso/i.test(user)
          ? 'Authentication'
          : /order/i.test(user)
            ? 'Order Management'
            : 'Other',
      urgency: angry ? 'high' : 'medium',
      sentiment: angry ? 'frustrated' : 'neutral',
      summary: '[MOCK] ' + String(user).slice(0, 90).replace(/\s+/g, ' ') + '…',
    });
  } else if (/score how similar/i.test(system)) {
    const ids = [...String(user).matchAll(/"id":"(KB-\d+)"/g)].map((m) => m[1]);
    content = JSON.stringify(ids.map((id, i) => ({ id, similarity: Math.max(0.1, 0.9 - i * 0.05) })));
  } else {
    content = JSON.stringify({
      customer_reply:
        'Hi there,\n\n[MOCK RESPONSE — no credits were used] Thank you for reaching out, and I completely understand the frustration. Our team has identified the likely cause and is correcting the sync now; you will receive a confirmation within the hour.\n\nBest regards,\nSupport Team',
      internal_note:
        '[MOCK] Probable root cause: inventory sync lag between ERP and storefront (see KB-002). Suggested fix: re-run the stock reconciliation job and enable the sync-failure alert.',
    });
  }

  const promptTokens = body.messages.reduce((a, m) => a + approxTokens(m.content), 0);
  return {
    id: 'mock-' + Math.random().toString(36).slice(2),
    object: 'chat.completion',
    model: body.model,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: approxTokens(content),
      total_tokens: promptTokens + approxTokens(content),
    },
  };
}

function embeddingsResponse(body) {
  const inputs = Array.isArray(body.input) ? body.input : [body.input];
  const tokens = inputs.reduce((a, s) => a + approxTokens(s), 0);
  return {
    object: 'list',
    model: body.model,
    data: inputs.map((text, index) => ({ object: 'embedding', index, embedding: pseudoEmbed(text) })),
    usage: { prompt_tokens: tokens, total_tokens: tokens },
  };
}

const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const reply = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    try {
      // small artificial latency so the UI pipeline animation is visible
      const delay = 400 + Math.random() * 700;
      if (req.method === 'GET' && req.url.startsWith('/v1/models')) {
        return reply(200, MODELS);
      }
      const body = raw ? JSON.parse(raw) : {};
      if (req.method === 'POST' && req.url.startsWith('/v1/chat/completions')) {
        return void setTimeout(() => reply(200, chatResponse(body)), delay);
      }
      if (req.method === 'POST' && req.url.startsWith('/v1/embeddings')) {
        return void setTimeout(() => reply(200, embeddingsResponse(body)), delay);
      }
      reply(404, { error: { message: 'mock: unknown route ' + req.url } });
    } catch (err) {
      reply(500, { error: { message: 'mock: ' + err.message } });
    }
  });
});

server.listen(MOCK_PORT, () => {
  console.log(`[mock-mesh] DEV-ONLY mock Mesh gateway on http://localhost:${MOCK_PORT}/v1`);
});

module.exports = server;
