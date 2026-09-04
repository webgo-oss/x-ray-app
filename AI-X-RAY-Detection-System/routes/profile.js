const express = require('express');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { updateProfileValidation, validate } = require('../middleware/validators');
const { doubleCsrfProtection } = require('../middleware/csrf');
const { uploadBuffer } = require('../config/cloudinary');

const router = express.Router();

router.post('/updateprofile', requireAuth, upload.single('profilepic'), doubleCsrfProtection, updateProfileValidation, validate, async (req, res) => {
  const userId = req.session.user.id;
  const { updateprofilename, gender, age } = req.body;

  try {
    // upload middleware now uses multer's memoryStorage (see middleware/upload.js),
    // so a new picture is a buffer in memory, not a file already on disk — it needs
    // uploading to Cloudinary here to get a permanent URL to store.
    const profileImage = req.file
      ? await uploadBuffer(req.file.buffer, { folder: 'xray-app/profile-pics' })
      : req.session.user.profile_image || 'default.jpg';

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
