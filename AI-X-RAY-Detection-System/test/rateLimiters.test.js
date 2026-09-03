const express = require('express');
const request = require('supertest');
const { authLimiter, analyzeLimiter, nearbyLimiter } = require('../middleware/rateLimiters');

describe('rate limiters', () => {
  test('all three are Express middleware functions', () => {
    expect(typeof authLimiter).toBe('function');
    expect(typeof analyzeLimiter).toBe('function');
    expect(typeof nearbyLimiter).toBe('function');
  });

  // authLimiter is the cheapest to exercise for real (no I/O per request,
  // and its max of 20 is small enough to actually hit within a test), so we
  // drive it to its real configured threshold rather than reconstructing a
  // lower-max stand-in — that would test express-rate-limit's counting, not
  // whether OUR handler/status/message wiring is correct.
  test('authLimiter allows the 20th request and rejects the 21st with a friendly HTML error', async () => {
    const app = express();
    app.set('view engine', 'ejs');
    app.set('views', require('path').join(__dirname, '..', 'views'));
    app.use(authLimiter);
    app.get('/', (req, res) => res.status(200).send('ok'));

    let res;
    for (let i = 0; i < 20; i++) {
      res = await request(app).get('/');
      expect(res.status).toBe(200);
    }
    res = await request(app).get('/'); // 21st request
    expect(res.status).toBe(429);
    expect(res.text.toLowerCase()).toContain('too many attempts');
  }, 15000);

  test('nearbyLimiter rejects over its max with a JSON (not HTML) error body', async () => {
    const app = express();
    app.use(nearbyLimiter);
    app.get('/', (req, res) => res.status(200).send('ok'));

    let res;
    for (let i = 0; i < 30; i++) {
      res = await request(app).get('/');
      expect(res.status).toBe(200);
    }
    res = await request(app).get('/'); // 31st request
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/too many requests/i);
  }, 15000);
});
