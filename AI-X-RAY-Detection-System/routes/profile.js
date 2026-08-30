const express = require('express');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

const router = express.Router();

router.post('/updateprofile', requireAuth, upload.single('profilepic'), async (req, res) => {
  const userId = req.session.user.id;
  const { updateprofilename, gender, age } = req.body;
  const profileImage = req.file ? req.file.filename : req.session.user.profile_image || 'default.jpg';

  try {
    await User.findByIdAndUpdate(userId, {
      name: updateprofilename,
      gender,
      age,
      profile_image: profileImage
    });

    req.session.user.name = updateprofilename;
    req.session.user.gender = gender;
    req.session.user.age = age;
    req.session.user.profile_image = profileImage;

    console.log('Profile updated:', req.session.user);
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Profile update error:', err.message);
    res.status(500).send('Database update failed');
  }
});

module.exports = router;
