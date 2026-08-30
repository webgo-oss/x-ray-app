require('dotenv').config();
const express = require('express');
const bodyparser = require('body-parser');
const session = require('express-session');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const multer = require('multer');
const mongoose = require('./config/db'); // connects to MongoDB on startup

const authRoutes = require('./routes/auth');
const pageRoutes = require('./routes/pages');
const profileRoutes = require('./routes/profile');
const analyzeRoutes = require('./routes/analyze');

const app = express();

app.set('view engine', 'ejs');
app.use(helmet({
  contentSecurityPolicy: false // views load fonts/scripts from external CDNs; keep off unless you write a full CSP
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.static('./public'));
app.use(bodyparser.urlencoded({ extended: true, limit: '100kb' })); // text fields only — file uploads go through multer, not this
app.use(express.json({ limit: '100kb' }));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24h
  }
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
