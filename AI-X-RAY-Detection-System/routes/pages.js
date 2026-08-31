const express = require('express');
const mongoose = require('mongoose');
const Scan = require('../models/Scan');
const { requireAuth } = require('../middleware/auth');
const { generateCsrfToken } = require('../middleware/csrf');

const router = express.Router();

router.get('/health', (req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'ok' : 'degraded',
    db: dbConnected ? 'connected' : 'disconnected',
    uptime: process.uptime()
  });
});

router.get('/main', (req, res) => {
  res.render('index', { user: req.session.user || null, csrfToken: generateCsrfToken(req, res) });
});

router.get('/infomation', (req, res) => {
  res.render('info', { user: req.session.user || null });
});

router.get('/nearby-doctors', requireAuth, (req, res) => {
  res.render('nearby', { user: req.session.user });
});

router.get('/about', (req, res) => {
  res.render('about_me', { user: req.session.user || null });
});

const PAGE_SIZE = 10;

router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);

    const [history, totalScans] = await Promise.all([
      Scan.find({ user_id: req.session.user.id })
        .sort({ created_at: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean(), // read-only render — skip Mongoose document overhead
      Scan.countDocuments({ user_id: req.session.user.id })
    ]);

    const totalPages = Math.max(1, Math.ceil(totalScans / PAGE_SIZE));

    res.render('userdashboard', {
      user: req.session.user,
      history,
      count: totalScans,
      currentPage: page,
      totalPages,
      csrfToken: generateCsrfToken(req, res)
    });
  } catch (err) {
    console.error('Dashboard error:', err.message);
    res.status(500).render('error', { error: 'Could not load dashboard' });
  }
});

module.exports = router;
