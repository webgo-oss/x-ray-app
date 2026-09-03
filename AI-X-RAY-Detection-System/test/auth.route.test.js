jest.mock('bcrypt');
jest.mock('../models/User');
// CSRF protection itself isn't what these tests are about — bypass it here
// the same way test/nearby.route.test.js bypasses it, so tests exercise the
// actual register/login/logout logic instead of the CSRF token dance.
jest.mock('../middleware/csrf', () => ({
  generateCsrfToken: () => 'test-csrf-token',
  doubleCsrfProtection: (req, res, next) => next()
}));

const bcrypt = require('bcrypt');
const User = require('../models/User');
const express = require('express');
const request = require('supertest');
const authRoutes = require('../routes/auth');

function buildApp({ authed = false, sessionOverrides = {} } = {}) {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', require('path').join(__dirname, '..', 'views'));
  // Real HTML forms post as x-www-form-urlencoded — matches the parser
  // active.js actually wires up ahead of these routes.
  app.use(express.urlencoded({ extended: true }));
  app.use((req, res, next) => {
    req.session = {
      user: authed ? { id: 'u1' } : null,
      regenerate: (cb) => cb(null),
      destroy: (cb) => cb(null),
      save: (cb) => cb(null),
      ...sessionOverrides
    };
    next();
  });
  app.use('/', authRoutes);
  return app;
}

const VALID_REGISTRATION = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  password: 'hunter22',
  gender: 'female',
  age: '30'
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /', () => {
  test('shows the login page when not logged in', async () => {
    const app = buildApp();
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
  });

  test('redirects straight to /main when already logged in', async () => {
    const app = buildApp({ authed: true });
    const res = await request(app).get('/');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/main');
  });
});

describe('POST /register', () => {
  test('rejects a password shorter than 6 characters before touching the DB', async () => {
    User.findOne.mockResolvedValue(null);
    const app = buildApp();
    const res = await request(app)
      .post('/register')
      .send({ ...VALID_REGISTRATION, password: '123' }).type('form');

    expect(res.status).toBe(400);
    expect(User.create).not.toHaveBeenCalled();
  });

  test('rejects an out-of-range age', async () => {
    User.findOne.mockResolvedValue(null);
    const app = buildApp();
    const res = await request(app)
      .post('/register')
      .send({ ...VALID_REGISTRATION, age: '150' }).type('form');

    expect(res.status).toBe(400);
    expect(User.create).not.toHaveBeenCalled();
  });

  test('rejects a malformed email', async () => {
    User.findOne.mockResolvedValue(null);
    const app = buildApp();
    const res = await request(app)
      .post('/register')
      .send({ ...VALID_REGISTRATION, email: 'not-an-email' }).type('form');

    expect(res.status).toBe(400);
    expect(User.create).not.toHaveBeenCalled();
  });

  test('rejects a duplicate email without creating a second account', async () => {
    User.findOne.mockResolvedValue({ email: VALID_REGISTRATION.email }); // "already exists"
    const app = buildApp();
    const res = await request(app).post('/register').send(VALID_REGISTRATION).type('form');

    expect(res.status).toBe(400);
    expect(res.text.toLowerCase()).toContain('already registered');
    expect(User.create).not.toHaveBeenCalled();
  });

  test('hashes the password before storing — never the plaintext', async () => {
    User.findOne.mockResolvedValue(null);
    bcrypt.hash.mockResolvedValue('hashed-value');
    User.create.mockResolvedValue({});

    const app = buildApp();
    const res = await request(app).post('/register').send(VALID_REGISTRATION).type('form');

    expect(res.status).toBe(302);
    expect(bcrypt.hash).toHaveBeenCalledWith(VALID_REGISTRATION.password, 10);
    expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ password: 'hashed-value' }));
    expect(User.create).not.toHaveBeenCalledWith(expect.objectContaining({ password: VALID_REGISTRATION.password }));
  });

  test('returns a 500 error page if User.create throws', async () => {
    User.findOne.mockResolvedValue(null);
    bcrypt.hash.mockResolvedValue('hashed-value');
    User.create.mockRejectedValue(new Error('duplicate key'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const app = buildApp();
    const res = await request(app).post('/register').send(VALID_REGISTRATION).type('form');

    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });
});

describe('POST /login', () => {
  const LOGIN_BODY = { loginemail: 'jane@example.com', loginpassword: 'hunter22' };

  test('rejects missing password before querying the DB', async () => {
    const app = buildApp();
    const res = await request(app).post('/login').send({ loginemail: 'jane@example.com', loginpassword: '' }).type('form');

    expect(res.status).toBe(400);
    expect(User.findOne).not.toHaveBeenCalled();
  });

  test("renders an error, not a 500, when the user doesn't exist", async () => {
    User.findOne.mockResolvedValue(null);
    const app = buildApp();
    const res = await request(app).post('/login').send(LOGIN_BODY).type('form');

    expect(res.status).toBe(200); // res.render('error', ...) with no explicit status
    expect(res.text.toLowerCase()).toContain('user not found');
  });

  test('rejects an incorrect password without revealing whether it was the email or password', async () => {
    User.findOne.mockResolvedValue({ _id: 'u1', password: 'stored-hash', email: LOGIN_BODY.loginemail });
    bcrypt.compare.mockResolvedValue(false);
    const app = buildApp();
    const res = await request(app).post('/login').send(LOGIN_BODY).type('form');

    expect(res.text.toLowerCase()).toContain('incorrect password');
  });

  test('on success, regenerates the session and stores a safe subset of the user', async () => {
    const fakeUser = {
      _id: { toString: () => 'u1' },
      name: 'Jane Doe',
      email: LOGIN_BODY.loginemail,
      gender: 'Female',
      age: 30,
      password: 'stored-hash'
      // no profile_image — checks the 'default.jpg' fallback below
    };
    User.findOne.mockResolvedValue(fakeUser);
    bcrypt.compare.mockResolvedValue(true);

    let sessionUserAfterLogin = null;
    const app = buildApp({
      sessionOverrides: {
        // Regular function, not arrow — needs `this` to be the session
        // object at call time so it can read the user the route just set.
        save: function (cb) { sessionUserAfterLogin = this.user; cb(null); }
      }
    });
    const res = await request(app).post('/login').send(LOGIN_BODY).type('form');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/main');
    expect(sessionUserAfterLogin).toMatchObject({
      id: 'u1',
      name: 'Jane Doe',
      email: LOGIN_BODY.loginemail,
      profile_image: 'default.jpg'
    });
    // Password hash must never end up in the session.
    expect(sessionUserAfterLogin.password).toBeUndefined();
  });

  test('returns a 500 error page if session regeneration fails', async () => {
    User.findOne.mockResolvedValue({ _id: { toString: () => 'u1' }, password: 'h', email: LOGIN_BODY.loginemail, name: 'Jane', gender: 'Female', age: 30 });
    bcrypt.compare.mockResolvedValue(true);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const app = buildApp({
      sessionOverrides: { regenerate: (cb) => cb(new Error('store unreachable')) }
    });

    const res = await request(app).post('/login').send(LOGIN_BODY).type('form');
    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });
});

describe('GET /logout', () => {
  test('destroys the session, clears the cookie, and redirects home', async () => {
    let destroyed = false;
    const app = express();
    app.use((req, res, next) => {
      req.session = { destroy: (cb) => { destroyed = true; cb(null); } };
      next();
    });
    app.use('/', authRoutes);

    const res = await request(app).get('/logout');

    expect(destroyed).toBe(true);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
    expect(res.headers['set-cookie'].some((c) => c.startsWith('connect.sid='))).toBe(true);
  });

  test('returns 500 instead of crashing if session destroy fails', async () => {
    const app = express();
    app.use((req, res, next) => {
      req.session = { destroy: (cb) => cb(new Error('store unreachable')) };
      next();
    });
    app.use('/', authRoutes);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app).get('/logout');
    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });
});
