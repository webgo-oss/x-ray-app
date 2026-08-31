require('dotenv').config();
const express = require('express');
const bodyparser = require('body-parser');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const multer = require('multer');
const mongoose = require('./config/db'); // connects to MongoDB on startup

const authRoutes = require('./routes/auth');
const pageRoutes = require('./routes/pages');
const profileRoutes = require('./routes/profile');
const analyzeRoutes = require('./routes/analyze');

if (!process.env.SESSION_SECRET) {
  // express-session will silently sign cookies with `secret: undefined` otherwise,
  // which is both insecure and easy to lose track of across deploys.
  console.error('SESSION_SECRET is not set in .env');
  process.exit(1);
}

const app = express();

app.set('view engine', 'ejs');
app.use(helmet({
  contentSecurityPolicy: false // views load fonts/scripts from external CDNs; keep off unless you write a full CSP
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyparser.urlencoded({ extended: true, limit: '100kb' })); // text fields only — file uploads go through multer, not this
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser()); // required by the CSRF double-submit-cookie check
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Needed in production so express-session sees the *original* protocol (https)
// through a reverse proxy/load balancer (Render, Railway, nginx, etc). Without
// this, req.secure is always false behind a proxy, so a `cookie.secure: true`
// session cookie would never actually get set on the client — which looks
// exactly like "login doesn't stay logged in".
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const sessionStore = MongoStore.create({
  mongoUrl: process.env.MONGO_URI,
  collectionName: 'sessions',
  ttl: SESSION_MAX_AGE_MS / 1000 // seconds — keep in sync with cookie maxAge below
});
// MongoStore emits 'error' instead of throwing; with no listener, an unhandled
// 'error' event crashes the whole Node process on the next hiccup. Log it
// instead so a transient Mongo blip degrades gracefully rather than taking
// the server down (and every logged-in session with it).
sessionStore.on('error', (err) => console.error('Session store error:', err.message));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  // true so a session (and its id) exists from the first GET, even before login —
  // the CSRF token generated on the login/register page is bound to this session id,
  // and it has to still match when that same form is POSTed.
  saveUninitialized: true,
  // Without this, sessions live only in server RAM (MemoryStore) and are wiped every
  // time the process restarts — every logged-in user gets kicked out on every deploy,
  // crash, or nodemon reload, even though their cookie is still valid client-side.
  // Storing sessions in Mongo means a restart no longer logs anyone out.
  store: sessionStore,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    // false in dev so the cookie still works on plain http://localhost;
    // true in production so it's only ever sent over https.
    secure: process.env.NODE_ENV === 'production',
    // `rolling: true` below re-sends this on every request, resetting the 30-day
    // countdown each time — so as long as the user visits at least once every
    // 30 days, they never get logged out on their own. The only thing that
    // actually clears it is hitting /logout (which destroys the session outright).
    maxAge: SESSION_MAX_AGE_MS
  },
  rolling: true
}));

app.use('/', authRoutes);
app.use('/', pageRoutes);
app.use('/', profileRoutes);
app.use('/', analyzeRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', { error: 'Page not found' });
});

// Centralized error handler — catches multer errors (bad file type/size) and anything
// that reaches next(err) instead of being handled inline in a route.
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).render('error', { error: 'Your session expired or the form was tampered with. Please refresh and try again.' });
  }
  if (err instanceof multer.MulterError || err.message?.includes('Only image files')) {
    return res.status(400).render('error', { error: err.message });
  }
  res.status(500).render('error', { error: 'Something went wrong. Please try again.' });
});

const server = app.listen(3000, () => console.log('Node.js server running on http://localhost:3000'));

// Graceful shutdown — finish in-flight requests and close the DB connection cleanly
// instead of dropping connections when the process is killed (deploys, container restarts).
function shutdown(signal) {
  console.log(`${signal} received: shutting down gracefully`);
  server.close(() => {
    mongoose.connection.close(false).then(() => {
      console.log('MongoDB connection closed. Exiting.');
      process.exit(0);
    });
  });
  // Force-exit if shutdown hangs for more than 10s
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
