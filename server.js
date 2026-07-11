'use strict';

require('dotenv').config();

const path = require('node:path');
const express = require('express');
const pricing = require('./lib/pricing');
const pipeline = require('./lib/pipeline');

const app = express();
const PORT = process.env.PORT || 3000;

// Built-in demo key so the hosted demo works with zero setup (hackathon trade-off:
// low-balance key, rotated after judging). base64 only to dodge naive scrapers.
// Anyone can still use their own key via the 🔑 field — it always wins over this.
const DEMO_KEY = Buffer.from('cnNrXzAxS1g4MzNLQ0FGQjdLOFM2NzZFMUtBSE5D', 'base64').toString('utf8');
const SERVER_KEY = process.env.MESH_API_KEY || DEMO_KEY;

app.use(express.json({ limit: '100kb' }));

// Frontend (built by another agent; the folder may not exist yet, which is fine)
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});


app.post('/api/analyze', async (req, res) => {
  const ticket = req.body && req.body.ticket;
  if (typeof ticket !== 'string' || ticket.trim().length === 0) {
    res.status(400).json({ error: 'Body must be JSON: {"ticket": "<non-empty string>"}' });
    return;
  }

  // Optional per-request key from the UI (judges can test with their own key).
  // Used only for this request's Mesh calls — never stored or logged.
  const headerKey = req.get('x-mesh-key');
  const ownKey = typeof headerKey === 'string' && headerKey.trim() ? headerKey.trim() : undefined;
  const apiKey = ownKey || SERVER_KEY;
  const usedDemoKey = !ownKey || ownKey === DEMO_KEY;

  // Server-Sent Events
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (event, data) => {
    if (res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    await pipeline.runPipeline(ticket.trim(), send, apiKey);
  } catch (err) {
    console.error('[analyze] pipeline error:', err);
    let message = err.message || 'Pipeline failed';
    if (usedDemoKey) {
      message =
        `The built-in demo key hit a problem: ${message} — ` +
        'you can paste your own Mesh API key in the 🔑 field above and try again.';
    }
    send('error', { message });
  } finally {
    res.end();
  }
});

async function start() {
  pipeline.loadKnowledgeBase();
  await pricing.init(); // falls back to the hardcoded table on failure, never throws

  app.listen(PORT, () => {
    console.log(`Ticket Whisperer backend listening on http://localhost:${PORT}`);
    console.log(
      `[models] classify=${pipeline.CLASSIFY_MODEL} embed=${pipeline.EMBED_MODEL} ` +
        `draft=${pipeline.DRAFT_MODEL} premium(compare-only)=${pipeline.PREMIUM_MODEL}`
    );
  });
}

start();
