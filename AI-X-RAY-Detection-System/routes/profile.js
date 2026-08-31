const express = require('express');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { updateProfileValidation, validate } = require('../middleware/validators');
const { doubleCsrfProtection } = require('../middleware/csrf');

const router = express.Router();

router.post('/updateprofile', requireAuth, upload.single('profilepic'), doubleCsrfProtection, updateProfileValidation, validate, async (req, res) => {
  const userId = req.session.user.id;
  const { updateprofilename, gender, age } = req.body;
  const profileImage = req.file ? req.file.filename : req.session.user.profile_image || 'default.jpg';

  try {
    await User.findByIdAndUpdate(userId, {
      name: updateprofilename,
      gender,
      age,
      profile_image: profileImage
    }, { runValidators: true, context: 'query' });

    req.session.user.name = updateprofilename;
    req.session.user.gender = gender;
    req.session.user.age = age;
    req.session.user.profile_image = profileImage;

    console.log('Profile updated:', req.session.user);
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Profile update error:', err.message);
    if (err.name === 'ValidationError') {
      return res.status(400).render('error', { error: Object.values(err.errors)[0].message });
    }
    res.status(500).render('error', { error: 'Database update failed' });
  }
});

module.exports = router;
