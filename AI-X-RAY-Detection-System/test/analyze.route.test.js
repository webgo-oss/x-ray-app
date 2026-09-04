jest.mock('axios', () => ({ post: jest.fn(), get: jest.fn() }));
jest.mock('../models/Scan', () => ({ countDocuments: jest.fn(), create: jest.fn() }));
jest.mock('../middleware/csrf', () => ({
  generateCsrfToken: () => 'test-csrf-token',
  doubleCsrfProtection: (req, res, next) => next()
}));
jest.mock('../config/cloudinary', () => ({
  uploadBuffer: jest.fn()
}));

const axios = require('axios');
const Scan = require('../models/Scan');
const express = require('express');
const request = require('supertest');
const path = require('path');

function buildApp({ authed = true } = {}) {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use((req, res, next) => {
    req.session = authed ? { user: { id: 'u1', name: 'Jane', age: 30, gender: 'Female', profile_image: 'default.jpg' } } : {};
    next();
  });
  const analyzeRoutes = require('../routes/analyze');
  app.use('/', analyzeRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /verify-xray', () => {
  // Real memory-storage multer runs here (no disk I/O), so we can post an
  // actual multipart body instead of mocking the upload middleware.

  test('400s with no file attached, without calling the classifier', async () => {
    const app = buildApp();
    const res = await request(app).post('/verify-xray');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no file uploaded/i);
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('forwards a successful classification result as-is', async () => {
    axios.post.mockResolvedValue({ data: { isXray: true, confidence: 0.97 } });
    const app = buildApp();
    const res = await request(app)
      .post('/verify-xray')
      .attach('xray', Buffer.from('fake-image-bytes'), 'test.jpg');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ isXray: true, confidence: 0.97 });
    expect(axios.post).toHaveBeenCalledWith(
      'http://127.0.0.1:5000/verify-xray',
      expect.anything(),
      expect.objectContaining({ timeout: 10000 })
    );
  });

  test('returns 504 specifically when the classifier times out', async () => {
    const err = new Error('timeout of 10000ms exceeded');
    err.code = 'ECONNABORTED';
    axios.post.mockRejectedValue(err);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const app = buildApp();
    const res = await request(app)
      .post('/verify-xray')
      .attach('xray', Buffer.from('fake-image-bytes'), 'test.jpg');

    expect(res.status).toBe(504);
    expect(res.body.error).toMatch(/took too long/i);
    consoleSpy.mockRestore();
  });

  test('returns 502 for any other classifier failure', async () => {
    axios.post.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const app = buildApp();
    const res = await request(app)
      .post('/verify-xray')
      .attach('xray', Buffer.from('fake-image-bytes'), 'test.jpg');

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/could not reach the classifier/i);
    consoleSpy.mockRestore();
  });

  test('requires auth', async () => {
    const app = buildApp({ authed: false });
    const res = await request(app)
      .post('/verify-xray')
      .attach('xray', Buffer.from('fake-image-bytes'), 'test.jpg');

    expect(res.status).toBe(302);
    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe('POST /analyze', () => {
  // The real xrayUpload middleware now uses multer's memoryStorage (no disk
  // I/O) — swap it for a stub that behaves the same way, and mock
  // uploadBuffer (config/cloudinary) instead of the old fs disk-write calls.
  let uploadBufferMock;

  function mockUploadWithFile(file) {
    jest.doMock('../middleware/upload', () => ({
      xrayUpload: { single: () => (req, res, next) => { req.file = file; next(); } },
      upload: { single: () => (req, res, next) => next() }
    }));
  }
  function mockUploadWithError(message) {
    jest.doMock('../middleware/upload', () => ({
      xrayUpload: { single: () => (req, res, next) => next(new Error(message)) },
      upload: { single: () => (req, res, next) => next() }
    }));
  }

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('axios', () => ({ post: jest.fn(), get: jest.fn() }));
    jest.doMock('../models/Scan', () => ({ countDocuments: jest.fn(), create: jest.fn() }));
    jest.doMock('../middleware/csrf', () => ({
      generateCsrfToken: () => 'test-csrf-token',
      doubleCsrfProtection: (req, res, next) => next()
    }));
    uploadBufferMock = jest.fn().mockResolvedValue('https://res.cloudinary.com/demo/image/upload/fake.png');
    jest.doMock('../config/cloudinary', () => ({ uploadBuffer: uploadBufferMock }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function buildAnalyzeApp({ authed = true } = {}) {
    const app = express();
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '..', 'views'));
    app.use((req, res, next) => {
      req.session = authed ? { user: { id: 'u1', name: 'Jane', age: 30, gender: 'Female', profile_image: 'default.jpg' } } : {};
      next();
    });
    const analyzeRoutes = require('../routes/analyze');
    app.use('/', analyzeRoutes);
    return app;
  }

  test('400s with no file, without calling Flask', async () => {
    mockUploadWithFile(undefined);
    const analyzeAxios = require('axios');
    const app = buildAnalyzeApp();

    const res = await request(app).post('/analyze');

    expect(res.status).toBe(400);
    expect(analyzeAxios.post).not.toHaveBeenCalled();
  });

  test('renders the upload error instead of crashing when multer rejects the file', async () => {
    mockUploadWithError('Only image files (jpg, png, bmp) are allowed for x-ray uploads');
    const app = buildAnalyzeApp();

    const res = await request(app).post('/analyze');

    expect(res.status).toBe(200); // res.render('error', ...) — no explicit status set
    expect(res.text).toMatch(/only image files/i);
  });

  test('a positive prediction saves a Scan record and renders the result', async () => {
    mockUploadWithFile({ buffer: Buffer.from('fake-bytes'), originalname: 'x.jpg' });
    const analyzeAxios = require('axios');
    const ScanModel = require('../models/Scan');
    analyzeAxios.post.mockResolvedValue({ data: { prediction: 'Fracture', confidence: 92.5, heatmap: null, pdf: null } });
    ScanModel.countDocuments.mockResolvedValue(3);
    ScanModel.create.mockResolvedValue({});

    const app = buildAnalyzeApp();
    const res = await request(app).post('/analyze');

    expect(res.status).toBe(200);
    expect(uploadBufferMock).toHaveBeenCalledWith(expect.any(Buffer), { folder: 'xray-app/originals' });
    expect(ScanModel.create).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'u1',
      prediction: 'Fracture',
      confidence: 92.5,
      original_image: 'https://res.cloudinary.com/demo/image/upload/fake.png'
    }));
    expect(res.text).toContain('Fracture');
  });

  test('a null prediction ("not an x-ray") is NOT saved to scan history', async () => {
    mockUploadWithFile({ buffer: Buffer.from('fake-bytes'), originalname: 'x.jpg' });
    const analyzeAxios = require('axios');
    const ScanModel = require('../models/Scan');
    analyzeAxios.post.mockResolvedValue({ data: { prediction: null } });
    ScanModel.countDocuments.mockResolvedValue(3);

    const app = buildAnalyzeApp();
    const res = await request(app).post('/analyze');

    expect(res.status).toBe(200);
    expect(ScanModel.create).not.toHaveBeenCalled();
    expect(res.text).toContain('Not an X-ray');
    // Even a rejected ("not an x-ray") upload still gets a permanent URL —
    // the result page shows the original regardless of the outcome.
    expect(uploadBufferMock).toHaveBeenCalledWith(expect.any(Buffer), { folder: 'xray-app/originals' });
  });

  test('uploads the heatmap Flask returns to Cloudinary and stores its URL', async () => {
    mockUploadWithFile({ buffer: Buffer.from('fake-bytes'), originalname: 'x.jpg' });
    const analyzeAxios = require('axios');
    const ScanModel = require('../models/Scan');
    analyzeAxios.post.mockResolvedValue({
      data: { prediction: 'Normal', confidence: 88, heatmap: '/static/heatmap123.png', pdf: null }
    });
    analyzeAxios.get.mockResolvedValue({ data: Buffer.from('fake-png-bytes') });
    ScanModel.countDocuments.mockResolvedValue(1);
    ScanModel.create.mockResolvedValue({});
    uploadBufferMock
      .mockResolvedValueOnce('https://res.cloudinary.com/demo/image/upload/original.png')
      .mockResolvedValueOnce('https://res.cloudinary.com/demo/image/upload/heatmap.png');

    const app = buildAnalyzeApp();
    const res = await request(app).post('/analyze');

    expect(res.status).toBe(200);
    expect(analyzeAxios.get).toHaveBeenCalledWith(
      'http://127.0.0.1:5000/static/heatmap123.png',
      expect.objectContaining({ responseType: 'arraybuffer' })
    );
    expect(uploadBufferMock).toHaveBeenCalledWith(expect.any(Buffer), { folder: 'xray-app/heatmaps' });
    expect(ScanModel.create).toHaveBeenCalledWith(expect.objectContaining({
      heatmap_image: 'https://res.cloudinary.com/demo/image/upload/heatmap.png'
    }));
  });

  test('a Flask timeout renders a friendly error, not a 500 crash', async () => {
    mockUploadWithFile({ buffer: Buffer.from('fake-bytes'), originalname: 'x.jpg' });
    const analyzeAxios = require('axios');
    const err = new Error('timeout of 30000ms exceeded');
    err.code = 'ECONNABORTED';
    analyzeAxios.post.mockRejectedValue(err);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const app = buildAnalyzeApp();
    const res = await request(app).post('/analyze');

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/taking longer than expected/i);
    consoleSpy.mockRestore();
  });

  test('requires auth', async () => {
    mockUploadWithFile({ buffer: Buffer.from('fake-bytes'), originalname: 'x.jpg' });
    const analyzeAxios = require('axios');
    const app = buildAnalyzeApp({ authed: false });

    const res = await request(app).post('/analyze');

    expect(res.status).toBe(302);
    expect(analyzeAxios.post).not.toHaveBeenCalled();
  });
});
