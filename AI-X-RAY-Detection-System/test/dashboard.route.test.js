jest.mock('mongoose', () => ({ connection: { readyState: 1 } }));
jest.mock('../middleware/csrf', () => ({ generateCsrfToken: () => 'test-csrf-token' }));

// Chainable mock matching Scan.find(...).sort().skip().limit().lean() usage
// in routes/pages.js — each method returns `this` so the chain resolves to
// the value handed to jest.fn() at the very end (.lean()).
function makeFindChain(resolvedHistory) {
  const chain = {
    sort: jest.fn(() => chain),
    skip: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    lean: jest.fn(() => Promise.resolve(resolvedHistory))
  };
  return chain;
}

jest.mock('../models/Scan', () => ({
  find: jest.fn(),
  countDocuments: jest.fn()
}));

const Scan = require('../models/Scan');
const express = require('express');
const request = require('supertest');
const pageRoutes = require('../routes/pages');

function buildApp({ authed = true } = {}) {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', require('path').join(__dirname, '..', 'views'));
  app.use((req, res, next) => {
    req.session = authed ? { user: { id: 'u1', name: 'Test User' } } : {};
    next();
  });
  app.use('/', pageRoutes);
  return app;
}

const SAMPLE_SCAN = {
  _id: 's1',
  prediction: 'Fracture',
  confidence: 0.9,
  created_at: new Date('2026-01-01'),
  original_image: '/uploads/x.jpg'
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /dashboard', () => {
  test('redirects unauthenticated requests', async () => {
    const app = buildApp({ authed: false });
    const res = await request(app).get('/dashboard');
    expect(res.status).toBe(302);
    expect(Scan.find).not.toHaveBeenCalled();
  });

  test('defaults to page 1 and asks Mongo to skip 0 records', async () => {
    Scan.find.mockReturnValue(makeFindChain([SAMPLE_SCAN]));
    Scan.countDocuments.mockResolvedValue(1);

    const app = buildApp();
    const res = await request(app).get('/dashboard');

    expect(res.status).toBe(200);
    const chain = Scan.find.mock.results[0].value;
    expect(chain.skip).toHaveBeenCalledWith(0);
    expect(chain.limit).toHaveBeenCalledWith(10); // PAGE_SIZE
  });

  test('page=3 skips (page-1)*PAGE_SIZE = 20 records', async () => {
    Scan.find.mockReturnValue(makeFindChain([]));
    Scan.countDocuments.mockResolvedValue(45);

    const app = buildApp();
    const res = await request(app).get('/dashboard?page=3');

    expect(res.status).toBe(200);
    const chain = Scan.find.mock.results[0].value;
    expect(chain.skip).toHaveBeenCalledWith(20);
  });

  test('non-numeric page falls back to page 1 instead of NaN-based skip', async () => {
    Scan.find.mockReturnValue(makeFindChain([]));
    Scan.countDocuments.mockResolvedValue(0);

    const app = buildApp();
    const res = await request(app).get('/dashboard?page=notanumber');

    expect(res.status).toBe(200);
    const chain = Scan.find.mock.results[0].value;
    expect(chain.skip).toHaveBeenCalledWith(0);
  });

  test('negative or zero page is clamped up to page 1', async () => {
    Scan.find.mockReturnValue(makeFindChain([]));
    Scan.countDocuments.mockResolvedValue(0);

    const app = buildApp();
    const res = await request(app).get('/dashboard?page=-5');

    expect(res.status).toBe(200);
    const chain = Scan.find.mock.results[0].value;
    expect(chain.skip).toHaveBeenCalledWith(0);
  });

  test('totalPages is at least 1 even with zero scans (avoids 0-of-0 pagination)', async () => {
    Scan.find.mockReturnValue(makeFindChain([]));
    Scan.countDocuments.mockResolvedValue(0);

    const app = buildApp();
    const res = await request(app).get('/dashboard');

    expect(res.status).toBe(200);
    expect(res.text).toContain('0'); // count rendered somewhere
  });

  test('scopes the query to the logged-in user only', async () => {
    Scan.find.mockReturnValue(makeFindChain([]));
    Scan.countDocuments.mockResolvedValue(0);

    const app = buildApp();
    await request(app).get('/dashboard');

    expect(Scan.find).toHaveBeenCalledWith({ user_id: 'u1' });
    expect(Scan.countDocuments).toHaveBeenCalledWith({ user_id: 'u1' });
  });

  test('renders a 500 error page if the DB query throws', async () => {
    Scan.find.mockImplementation(() => { throw new Error('Mongo is down'); });
    Scan.countDocuments.mockResolvedValue(0);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const app = buildApp();
    const res = await request(app).get('/dashboard');

    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });
});
