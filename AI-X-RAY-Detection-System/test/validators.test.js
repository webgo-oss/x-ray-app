jest.mock('../models/User');
const User = require('../models/User');
const express = require('express');
const request = require('supertest');
const { registerValidation, loginValidation, updateProfileValidation, validate } = require('../middleware/validators');

function buildApp(chain) {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', require('path').join(__dirname, '..', 'views'));
  app.use(express.urlencoded({ extended: true }));
  app.post('/test', chain, validate, (req, res) => res.status(200).json({ ok: true, body: req.body }));
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('registerValidation', () => {
  const VALID = { name: 'Jane Doe', email: 'jane@example.com', password: 'hunter22', gender: 'male', age: '30' };

  test('passes with valid input and a free email', async () => {
    User.findOne.mockResolvedValue(null);
    const app = buildApp(registerValidation);
    const res = await request(app).post('/test').type('form').send(VALID);

    expect(res.status).toBe(200);
    expect(User.findOne).toHaveBeenCalledWith({ email: 'jane@example.com' });
  });

  test('fails when the email is already registered', async () => {
    User.findOne.mockResolvedValue({ email: VALID.email });
    const app = buildApp(registerValidation);
    const res = await request(app).post('/test').type('form').send(VALID);

    expect(res.status).toBe(400);
    expect(res.text.toLowerCase()).toContain('already registered');
  });

  test('fails on a missing name', async () => {
    User.findOne.mockResolvedValue(null);
    const app = buildApp(registerValidation);
    const res = await request(app).post('/test').type('form').send({ ...VALID, name: '' });
    expect(res.status).toBe(400);
  });

  test('fails on a name over 60 characters', async () => {
    User.findOne.mockResolvedValue(null);
    const app = buildApp(registerValidation);
    const res = await request(app).post('/test').type('form').send({ ...VALID, name: 'a'.repeat(61) });
    expect(res.status).toBe(400);
  });

  test('fails on a malformed email', async () => {
    User.findOne.mockResolvedValue(null);
    const app = buildApp(registerValidation);
    const res = await request(app).post('/test').type('form').send({ ...VALID, email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  test('normalizes the email before the uniqueness check runs', async () => {
    User.findOne.mockResolvedValue(null);
    const app = buildApp(registerValidation);
    await request(app).post('/test').type('form').send({ ...VALID, email: '  JANE@EXAMPLE.COM  ' });

    expect(User.findOne).toHaveBeenCalledWith({ email: 'jane@example.com' });
  });

  test('fails on a password under 6 characters', async () => {
    User.findOne.mockResolvedValue(null);
    const app = buildApp(registerValidation);
    const res = await request(app).post('/test').type('form').send({ ...VALID, password: '12345' });
    expect(res.status).toBe(400);
  });

  test('fails on an invalid gender', async () => {
    User.findOne.mockResolvedValue(null);
    const app = buildApp(registerValidation);
    const res = await request(app).post('/test').type('form').send({ ...VALID, gender: 'alien' });
    expect(res.status).toBe(400);
  });

  test('accepts gender case-insensitively', async () => {
    User.findOne.mockResolvedValue(null);
    const app = buildApp(registerValidation);
    const res = await request(app).post('/test').type('form').send({ ...VALID, gender: 'FEMALE' });
    expect(res.status).toBe(200);
  });

  test.each([[0, false], [1, true], [120, true], [121, false]])(
    'age boundary: %i is valid=%s',
    async (age, shouldPass) => {
      User.findOne.mockResolvedValue(null);
      const app = buildApp(registerValidation);
      const res = await request(app).post('/test').type('form').send({ ...VALID, age: String(age) });
      expect(res.status).toBe(shouldPass ? 200 : 400);
    }
  );
});

describe('loginValidation', () => {
  test('passes with a valid email and non-empty password', async () => {
    const app = buildApp(loginValidation);
    const res = await request(app).post('/test').type('form').send({ loginemail: 'jane@example.com', loginpassword: 'x' });
    expect(res.status).toBe(200);
  });

  test('fails on an empty password', async () => {
    const app = buildApp(loginValidation);
    const res = await request(app).post('/test').type('form').send({ loginemail: 'jane@example.com', loginpassword: '' });
    expect(res.status).toBe(400);
  });

  test('fails on a malformed email', async () => {
    const app = buildApp(loginValidation);
    const res = await request(app).post('/test').type('form').send({ loginemail: 'nope', loginpassword: 'x' });
    expect(res.status).toBe(400);
  });

  test('does not perform any DB lookup (login only checks format)', async () => {
    const app = buildApp(loginValidation);
    await request(app).post('/test').type('form').send({ loginemail: 'jane@example.com', loginpassword: 'x' });
    expect(User.findOne).not.toHaveBeenCalled();
  });
});

describe('updateProfileValidation', () => {
  const VALID = { updateprofilename: 'Jane Doe', gender: 'female', age: '25' };

  test('passes with valid input', async () => {
    const app = buildApp(updateProfileValidation);
    const res = await request(app).post('/test').type('form').send(VALID);
    expect(res.status).toBe(200);
  });

  test('fails on an empty name', async () => {
    const app = buildApp(updateProfileValidation);
    const res = await request(app).post('/test').type('form').send({ ...VALID, updateprofilename: '' });
    expect(res.status).toBe(400);
  });

  test('fails on an invalid gender', async () => {
    const app = buildApp(updateProfileValidation);
    const res = await request(app).post('/test').type('form').send({ ...VALID, gender: 'robot' });
    expect(res.status).toBe(400);
  });

  test('fails on an out-of-range age', async () => {
    const app = buildApp(updateProfileValidation);
    const res = await request(app).post('/test').type('form').send({ ...VALID, age: '200' });
    expect(res.status).toBe(400);
  });

  test('does not check email uniqueness (profile updates have no email field)', async () => {
    const app = buildApp(updateProfileValidation);
    await request(app).post('/test').type('form').send(VALID);
    expect(User.findOne).not.toHaveBeenCalled();
  });
});
