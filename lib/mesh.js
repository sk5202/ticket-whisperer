'use strict';

/**
 * Minimal Mesh API client (OpenAI-compatible gateway).
 * Uses Node's built-in global fetch. All AI traffic goes through here.
 */

function baseUrl() {
  return (process.env.MESH_BASE_URL || 'https://api.meshapi.ai/v1').replace(/\/+$/, '');
}

function authHeaders(apiKeyOverride) {
  const key = apiKeyOverride || process.env.MESH_API_KEY;
  if (!key) {
    throw new MeshError(
      'No Mesh API key. Paste your key in the UI (🔑 field) or set MESH_API_KEY in .env.',
      0,
      null
    );
  }
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

class MeshError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'MeshError';
    this.status = status;
    this.body = body;
  }
}

async function meshFetch(path, options = {}, apiKeyOverride) {
  const url = `${baseUrl()}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { ...authHeaders(apiKeyOverride), ...(options.headers || {}) },
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON body; leave as null
  }

  if (!res.ok) {
    const msg =
      (body && body.error && (body.error.message || body.error.code)) ||
      `Mesh API request failed (${res.status} ${res.statusText})`;
    throw new MeshError(`${msg} [${path}]`, res.status, body);
  }
  return body;
}

/**
 * POST /chat/completions — standard OpenAI chat format.
 * @param {{model: string, messages: Array, [key: string]: any}} payload
 * @param {string} [apiKey] per-request key override (falls back to MESH_API_KEY)
 */
async function chat(payload, apiKey) {
  return meshFetch(
    '/chat/completions',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    apiKey
  );
}

/**
 * POST /embeddings — OpenAI embeddings format {model, input}.
 * @param {{model: string, input: string|string[]}} payload
 * @param {string} [apiKey] per-request key override (falls back to MESH_API_KEY)
 */
async function embed(payload, apiKey) {
  return meshFetch(
    '/embeddings',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    apiKey
  );
}

/**
 * GET /models — Mesh returns a JSON ARRAY of model objects
 * ({id, name, model_type, pricing:{prompt_usd_per_1m, ...}, ...}).
 */
async function listModels() {
  const body = await meshFetch('/models', { method: 'GET' });
  // Be liberal: Mesh returns a bare array, but tolerate {data:[...]} too.
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.data)) return body.data;
  throw new MeshError('Unexpected /models response shape', 200, body);
}

module.exports = { chat, embed, listModels, MeshError };
