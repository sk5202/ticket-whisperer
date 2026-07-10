'use strict';

/**
 * DEV-ONLY launcher: starts the mock Mesh gateway, points the app at it,
 * then boots the real server. Zero product-code changes — only MESH_BASE_URL
 * is redirected. Usage: `npm run dev:mock`, then open http://localhost:3000.
 */

const MOCK_PORT = process.env.MOCK_MESH_PORT || 4001;
process.env.MESH_BASE_URL = `http://localhost:${MOCK_PORT}/v1`;
process.env.MESH_API_KEY = process.env.MESH_API_KEY || 'rsk_mock_dev_key';

console.log('==============================================================');
console.log(' DEV MOCK MODE — no real Mesh calls, no credits used.');
console.log(' Responses are canned; use a real key + `npm start` for demos.');
console.log('==============================================================');

require('./mock-mesh');
require('../server');
