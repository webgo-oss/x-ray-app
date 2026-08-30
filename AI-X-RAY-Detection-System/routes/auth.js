const express = require('express');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const { registerValidation, loginValidation, validate } = require('../middleware/validators');
const { authLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

router.get('/', (req, res) => res.render('login'));

router.post('/register', authLimiter, registerValidation, validate, async (req, res) => {
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

router.post('/login', authLimiter, loginValidation, validate, async (req, res) => {
  const { loginemail, loginpassword } = req.body;
  try {
    const user = await User.findOne({ email: loginemail });
    if (!user) return res.render('error', { error: 'User not found' });

    const match = await bcrypt.compare(loginpassword, user.password);
    if (!match) {
      return res.render('error', { error: 'Incorrect password' });
    }

    req.session.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      gender: user.gender,
      age: user.age,
      profile_image: user.profile_image || 'default.jpg'
    };
    res.redirect('/main');
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
