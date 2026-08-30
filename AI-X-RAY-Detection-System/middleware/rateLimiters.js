const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).render('error', { error: 'Too many attempts. Please try again in a few minutes.' });
  }
});

// /analyze calls out to the Flask/Keras backend for inference — much heavier per-request
// than a login attempt, so it gets its own, looser limit to prevent backend overload.
const analyzeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).render('error', { error: 'Too many scans submitted. Please slow down and try again shortly.' });
  }
});

module.exports = { authLimiter, analyzeLimiter };
