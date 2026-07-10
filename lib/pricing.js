'use strict';

/**
 * Pricing: live rates from GET {base}/models with a hardcoded fallback table.
 * All rates are USD per 1M tokens: { in_per_1m, out_per_1m }.
 */

const mesh = require('./mesh');

// Fallback in case the /models fetch fails at startup.
const FALLBACK_PRICING = {
  'openai/gpt-4o-mini': { in_per_1m: 0.15, out_per_1m: 0.6 },
  'openai/text-embedding-3-small': { in_per_1m: 0.02, out_per_1m: 0 },
  'anthropic/claude-sonnet-4.6': { in_per_1m: 3, out_per_1m: 15 },
  'openai/gpt-5.5': { in_per_1m: 5, out_per_1m: 30 },
};

// id -> { in_per_1m, out_per_1m }
const rates = new Map(Object.entries(FALLBACK_PRICING));
let initialized = false;

/**
 * Fetch live pricing from the Mesh /models endpoint and build the rate map.
 * Never throws — on failure the hardcoded fallback table remains in effect.
 */
async function init() {
  try {
    const models = await mesh.listModels();
    let count = 0;
    for (const m of models) {
      if (!m || !m.id || !m.pricing) continue;
      const inRate = parseFloat(m.pricing.prompt_usd_per_1m);
      const outRate = parseFloat(m.pricing.completion_usd_per_1m);
      if (Number.isNaN(inRate) && Number.isNaN(outRate)) continue;
      rates.set(m.id, {
        in_per_1m: Number.isNaN(inRate) ? 0 : inRate,
        out_per_1m: Number.isNaN(outRate) ? 0 : outRate,
      });
      count++;
    }
    initialized = true;
    console.log(`[pricing] Loaded live pricing for ${count} models from Mesh.`);
  } catch (err) {
    console.warn(
      `[pricing] Could not fetch live pricing (${err.message}); using hardcoded fallback table.`
    );
  }
}

/** @returns {{in_per_1m: number, out_per_1m: number}} */
function getRates(modelId) {
  const r = rates.get(modelId);
  if (r) return r;
  console.warn(`[pricing] No pricing found for model "${modelId}"; treating as $0.`);
  return { in_per_1m: 0, out_per_1m: 0 };
}

/**
 * Cost in USD for a single call.
 */
function costUsd(modelId, promptTokens, completionTokens) {
  const r = getRates(modelId);
  const cost =
    ((promptTokens || 0) * r.in_per_1m) / 1e6 + ((completionTokens || 0) * r.out_per_1m) / 1e6;
  return round6(cost);
}

function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}

function isLive() {
  return initialized;
}

module.exports = { init, getRates, costUsd, round6, isLive, FALLBACK_PRICING };
