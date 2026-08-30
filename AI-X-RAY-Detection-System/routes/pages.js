const express = require('express');
const Scan = require('../models/Scan');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/main', (req, res) => {
  res.render('index', { user: req.session.user || null });
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

router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const history = await Scan.find({ user_id: req.session.user.id }).sort({ created_at: -1 });
    res.render('userdashboard', {
      user: req.session.user,
      history,
      count: history.length
    });
  } catch (err) {
    console.error('Dashboard error:', err.message);
    res.status(500).send('DB error');
  }
});

module.exports = router;
