import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { parseChannelIdOrHandle } from '../pages/api/videos.js';

test('parseChannelIdOrHandle handles channel handle', () => {
  assert.deepEqual(parseChannelIdOrHandle('@destiny'), { handle: 'destiny' });
});

test('handler logs and returns 404 when channel cannot resolve', async () => {
  const req = { query: { channel: 'nonexistent' } };
  let statusCode;
  let body;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
    },
  };
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args);

  process.env.YOUTUBE_API_KEY = 'test-key';

  global.fetch = async () => ({ json: async () => ({ items: [] }) });

  await handler(req, res);

  assert.equal(statusCode, 404);
  assert.deepEqual(body, { error: 'Could not resolve the channel.' });
  assert.ok(errors.length > 0);

  console.error = originalError;
});
