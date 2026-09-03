jest.mock('mongoose', () => ({ connection: { readyState: 0 } }));
jest.mock('../models/Scan', () => ({}));
jest.mock('../middleware/csrf', () => ({ generateCsrfToken: () => 'test-csrf-token' }));

const mongoose = require('mongoose');
const express = require('express');
const request = require('supertest');
const pageRoutes = require('../routes/pages');

function buildApp() {
  const app = express();
  app.use((req, res, next) => {
    req.session = {};
    next();
  });
  app.use('/', pageRoutes);
  return app;
}

describe('GET /health', () => {
  test('reports ok/connected when the DB connection is up', async () => {
    mongoose.connection.readyState = 1; // mongoose's "connected" state
    const app = buildApp();
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('connected');
    expect(typeof res.body.uptime).toBe('number');
  });

  test('reports degraded/disconnected (503) when the DB connection is down', async () => {
    mongoose.connection.readyState = 0; // mongoose's "disconnected" state
    const app = buildApp();
    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.db).toBe('disconnected');
  });

  test('also treats "connecting" (state 2) and "disconnecting" (state 3) as not healthy', async () => {
    const app = buildApp();

    mongoose.connection.readyState = 2;
    let res = await request(app).get('/health');
    expect(res.status).toBe(503);

    mongoose.connection.readyState = 3;
    res = await request(app).get('/health');
    expect(res.status).toBe(503);
  });
});
