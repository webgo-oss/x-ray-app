jest.mock('axios');
const axios = require('axios');
const express = require('express');
const request = require('supertest');
const pageRoutes = require('../routes/pages');

// pages.js also pulls in Scan/csrf/mongoose for its other routes, none of
// which /api/nearby touches — mock them out so this test file doesn't need
// a real MongoDB connection just to require() the router.
jest.mock('../models/Scan', () => ({}));
jest.mock('../middleware/csrf', () => ({ generateCsrfToken: () => 'test-csrf-token' }));

function buildApp({ authed = true } = {}) {
  const app = express();
  // Stand-in for express-session — requireAuth only checks req.session.user.
  app.use((req, res, next) => {
    req.session = authed ? { user: { id: 'u1' } } : {};
    next();
  });
  app.use('/', pageRoutes);
  return app;
}

const OVERPASS_OK_BODY = {
  elements: [
    { type: 'node', id: 1, lat: 28.62, lon: 77.21, tags: { amenity: 'pharmacy', name: 'Test Pharmacy' } }
  ]
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/nearby', () => {
  test('redirects unauthenticated requests instead of returning data', async () => {
    const app = buildApp({ authed: false });
    const res = await request(app).get('/api/nearby?lat=28.6139&lon=77.209&radius=5000');
    expect(res.status).toBe(302); // requireAuth redirects to '/'
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('400s on invalid lat/lon without calling Overpass at all', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/nearby?lat=999&lon=77.209&radius=5000');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid/i);
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('returns places from the first mirror when it succeeds', async () => {
    axios.post.mockResolvedValueOnce({ data: OVERPASS_OK_BODY });
    const app = buildApp();
    const res = await request(app).get('/api/nearby?lat=28.6139&lon=77.209&radius=5000');

    expect(res.status).toBe(200);
    expect(res.body.places).toHaveLength(1);
    expect(res.body.places[0].name).toBe('Test Pharmacy');
    expect(axios.post).toHaveBeenCalledTimes(1); // no fallback needed
  });

  test('falls back to the second mirror when the first fails', async () => {
    axios.post
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce({ data: OVERPASS_OK_BODY });

    const app = buildApp();
    const res = await request(app).get('/api/nearby?lat=28.6139&lon=77.209&radius=5000');

    expect(res.status).toBe(200);
    expect(res.body.places).toHaveLength(1);
    expect(axios.post).toHaveBeenCalledTimes(2);
    // First mirror in the list is tried before the second.
    expect(axios.post.mock.calls[0][0]).toBe('https://overpass-api.de/api/interpreter');
    expect(axios.post.mock.calls[1][0]).toBe('https://overpass.kumi.systems/api/interpreter');
  });

  test('returns 502 with no results leaked when every mirror fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    axios.post.mockRejectedValue(new Error('timeout of 12000ms exceeded'));
    const app = buildApp();
    const res = await request(app).get('/api/nearby?lat=28.6139&lon=77.209&radius=5000');

    expect(res.status).toBe(502);
    expect(res.body.places).toBeUndefined();
    expect(axios.post).toHaveBeenCalledTimes(3); // all 3 mirrors attempted
    consoleSpy.mockRestore();
  });

  test('filters out places beyond the requested radius even if Overpass over-returns', async () => {
    // Overpass's bbox is a square around the point, so it can return results
    // slightly outside the true circular radius — the route re-filters with
    // haversine distance to correct for that.
    axios.post.mockResolvedValueOnce({
      data: {
        elements: [
          { type: 'node', id: 1, lat: 28.6139, lon: 77.209, tags: { amenity: 'clinic', name: 'Right Here' } },
          { type: 'node', id: 2, lat: 29.5, lon: 78.5, tags: { amenity: 'clinic', name: 'Way Too Far' } }
        ]
      }
    });
    const app = buildApp();
    const res = await request(app).get('/api/nearby?lat=28.6139&lon=77.209&radius=2000');

    expect(res.status).toBe(200);
    expect(res.body.places.map((p) => p.name)).toEqual(['Right Here']);
  });

  test('clamps out-of-range radius into the allowed 500-20000m band', async () => {
    axios.post.mockResolvedValue({ data: { elements: [] } });
    const app = buildApp();

    const decodeQuery = (call) => decodeURIComponent(call[1].replace(/^data=/, ''));

    await request(app).get('/api/nearby?lat=28.6139&lon=77.209&radius=999999');
    expect(decodeQuery(axios.post.mock.calls[0])).toContain('[timeout:35]'); // clamped to 20000m tier

    jest.clearAllMocks();
    axios.post.mockResolvedValue({ data: { elements: [] } });
    await request(app).get('/api/nearby?lat=28.6139&lon=77.209&radius=1');
    expect(decodeQuery(axios.post.mock.calls[0])).toContain('[timeout:20]'); // clamped up to 500m tier
  });
});
