const express = require('express');
const bcrypt = require('bcrypt');
const User = require('../models/User');

const router = express.Router();

router.get('/', (req, res) => res.render('login'));

router.post('/register', async (req, res) => {
  const { name, email, password, gender, age } = req.body;
  if (!name || !email || !password || !gender || !age) {
    return res.status(400).send('All fields are required');
  }
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) {
    return res.status(400).send('Invalid email format');
  }
  if (password.length < 6) {
    return res.status(400).send('Password must be at least 6 characters long');
  }
  const ageNumber = parseInt(age, 10);
  if (isNaN(ageNumber) || ageNumber <= 0) {
    return res.status(400).send('Age must be greater than 0');
  }

  try {
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).send('Email already registered');

    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ name, email, password: hashedPassword, gender, age: ageNumber });
    res.redirect('/');
  } catch (err) {
    console.error('Registration error:', err.message);
    res.status(500).send('Registration failed');
  }
});

router.post('/login', async (req, res) => {
  const { loginemail, loginpassword } = req.body;
  try {
    const user = await User.findOne({ email: loginemail });
    if (!user) return res.status(400).send('User not found');

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
    res.status(500).send('Database error');
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
