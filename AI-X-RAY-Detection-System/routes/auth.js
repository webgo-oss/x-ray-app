const express = require('express');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const { registerValidation, loginValidation, validate } = require('../middleware/validators');
const { authLimiter } = require('../middleware/rateLimiters');
const { generateCsrfToken, doubleCsrfProtection } = require('../middleware/csrf');

const router = express.Router();

router.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/main');
  }
  res.render('login', { csrfToken: generateCsrfToken(req, res) });
});

router.post('/register', authLimiter, doubleCsrfProtection, registerValidation, validate, async (req, res) => {
  const { name, email, password, gender, age } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ name, email, password: hashedPassword, gender, age });
    res.redirect('/');
  } catch (err) {
    console.error('Registration error:', err.message);
    res.status(500).render('error', { error: 'Registration failed' });
  }
});

router.post('/login', authLimiter, doubleCsrfProtection, loginValidation, validate, async (req, res) => {
  const { loginemail, loginpassword } = req.body;
  try {
    const user = await User.findOne({ email: loginemail });
    if (!user) return res.render('error', { error: 'User not found' });

    const match = await bcrypt.compare(loginpassword, user.password);
    if (!match) {
      return res.render('error', { error: 'Incorrect password' });
    }

    const sessionUser = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      gender: user.gender,
      age: user.age,
      profile_image: user.profile_image || 'default.jpg'
    };

    // Swap in a fresh session id on login instead of reusing the pre-login one
    // (which was issued anonymously, before we knew who this was, and could in
    // theory have been planted on the visitor by an attacker — "session fixation").
    // We then save explicitly and only redirect once that write has actually
    // landed in Mongo, so the very next request (the browser following the
    // redirect) is guaranteed to find the logged-in session instead of racing it.
    req.session.regenerate((err) => {
      if (err) {
        console.error('Session regenerate error:', err.message);
        return res.status(500).render('error', { error: 'Something went wrong, please try again' });
      }
      req.session.user = sessionUser;
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('Session save error:', saveErr.message);
          return res.status(500).render('error', { error: 'Something went wrong, please try again' });
        }
        res.redirect('/main');
      });
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).render('error', { error: 'Something went wrong, please try again' });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).send('Could not log out');
    }
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

module.exports = router;
