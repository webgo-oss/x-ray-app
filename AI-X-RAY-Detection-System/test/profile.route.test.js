jest.mock('../models/User');
jest.mock('../middleware/csrf', () => ({
  generateCsrfToken: () => 'test-csrf-token',
  doubleCsrfProtection: (req, res, next) => next()
}));
// Real disk-writing upload middleware isn't needed here — /updateprofile
// works fine with no file attached (it falls back to the existing profile
// image), so we stub it to just call next() and never touch the filesystem.
jest.mock('../middleware/upload', () => ({
  upload: { single: () => (req, res, next) => next() },
  xrayUpload: { single: () => (req, res, next) => next() }
}));

const User = require('../models/User');
const express = require('express');
const request = require('supertest');
const path = require('path');
const profileRoutes = require('../routes/profile');

function buildApp({ authed = true, sessionUser } = {}) {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(express.urlencoded({ extended: true }));
  app.use((req, res, next) => {
    req.session = authed
      ? { user: sessionUser || { id: 'u1', name: 'Old Name', gender: 'Female', age: 30, profile_image: 'old.jpg' } }
      : {};
    next();
  });
  app.use('/', profileRoutes);
  return app;
}

const VALID_UPDATE = { updateprofilename: 'New Name', gender: 'male', age: '31' };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /updateprofile', () => {
  test('requires auth', async () => {
    const app = buildApp({ authed: false });
    const res = await request(app).post('/updateprofile').type('form').send(VALID_UPDATE);

    expect(res.status).toBe(302);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('rejects an empty name before touching the DB', async () => {
    const app = buildApp();
    const res = await request(app).post('/updateprofile').type('form').send({ ...VALID_UPDATE, updateprofilename: '' });

    expect(res.status).toBe(400);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('rejects an invalid gender value', async () => {
    const app = buildApp();
    const res = await request(app).post('/updateprofile').type('form').send({ ...VALID_UPDATE, gender: 'robot' });

    expect(res.status).toBe(400);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('rejects an out-of-range age', async () => {
    const app = buildApp();
    const res = await request(app).post('/updateprofile').type('form').send({ ...VALID_UPDATE, age: '0' });

    expect(res.status).toBe(400);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('on success, updates the DB and mirrors the change into the session', async () => {
    User.findByIdAndUpdate.mockResolvedValue({});
    const sessionUser = { id: 'u1', name: 'Old Name', gender: 'Female', age: 30, profile_image: 'old.jpg' };
    const app = buildApp({ sessionUser });

    const res = await request(app).post('/updateprofile').type('form').send(VALID_UPDATE);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/dashboard');
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ name: 'New Name', gender: 'male', age: 31 }),
      expect.objectContaining({ runValidators: true })
    );
    // The route mutates req.session.user directly — our captured reference
    // reflects that mutation after the request completes.
    expect(sessionUser.name).toBe('New Name');
    expect(sessionUser.age).toBe(31);
  });

  test('keeps the existing profile image when no new file is uploaded', async () => {
    User.findByIdAndUpdate.mockResolvedValue({});
    const sessionUser = { id: 'u1', name: 'Old Name', gender: 'Female', age: 30, profile_image: 'old.jpg' };
    const app = buildApp({ sessionUser });

    await request(app).post('/updateprofile').type('form').send(VALID_UPDATE);

    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ profile_image: 'old.jpg' }),
      expect.anything()
    );
  });

  test('uploads a new profile picture to Cloudinary and stores its URL', async () => {
    jest.resetModules();
    jest.doMock('../models/User');
    jest.doMock('../middleware/csrf', () => ({
      generateCsrfToken: () => 'test-csrf-token',
      doubleCsrfProtection: (req, res, next) => next()
    }));
    // This time actually set req.file, the way a real memoryStorage upload
    // would — a buffer, not a path/filename (that's the bug this test guards
    // against: profile.js used to read req.file.filename, which memoryStorage
    // never sets).
    jest.doMock('../middleware/upload', () => ({
      upload: { single: () => (req, res, next) => { req.file = { buffer: Buffer.from('fake-bytes'), originalname: 'pic.jpg' }; next(); } },
      xrayUpload: { single: () => (req, res, next) => next() }
    }));
    const uploadBufferMock = jest.fn().mockResolvedValue('https://res.cloudinary.com/demo/image/upload/pic.jpg');
    jest.doMock('../config/cloudinary', () => ({ uploadBuffer: uploadBufferMock }));

    const UserModel = require('../models/User');
    UserModel.findByIdAndUpdate.mockResolvedValue({});
    const express2 = require('express');
    const request2 = require('supertest');
    const profileRoutes2 = require('../routes/profile');

    const app = express2();
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '..', 'views'));
    app.use(express2.urlencoded({ extended: true }));
    const sessionUser = { id: 'u1', name: 'Old Name', gender: 'Female', age: 30, profile_image: 'old.jpg' };
    app.use((req, res, next) => { req.session = { user: sessionUser }; next(); });
    app.use('/', profileRoutes2);

    await request2(app).post('/updateprofile').type('form').send(VALID_UPDATE);

    expect(uploadBufferMock).toHaveBeenCalledWith(expect.any(Buffer), { folder: 'xray-app/profile-pics' });
    expect(UserModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ profile_image: 'https://res.cloudinary.com/demo/image/upload/pic.jpg' }),
      expect.anything()
    );
  });

  test('surfaces a Mongoose ValidationError message instead of a generic 500', async () => {
    const validationErr = new Error('Validation failed');
    validationErr.name = 'ValidationError';
    validationErr.errors = { age: { message: 'Age must be between 1 and 120' } };
    User.findByIdAndUpdate.mockRejectedValue(validationErr);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const app = buildApp();
    const res = await request(app).post('/updateprofile').type('form').send(VALID_UPDATE);

    expect(res.status).toBe(400);
    expect(res.text).toContain('Age must be between 1 and 120');
    consoleSpy.mockRestore();
  });

  test('returns a generic 500 for a non-validation DB failure', async () => {
    User.findByIdAndUpdate.mockRejectedValue(new Error('Mongo connection lost'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const app = buildApp();
    const res = await request(app).post('/updateprofile').type('form').send(VALID_UPDATE);

    expect(res.status).toBe(500);
    expect(res.text).toMatch(/database update failed/i);
    consoleSpy.mockRestore();
  });
});
