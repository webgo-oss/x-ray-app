const { body, validationResult } = require('express-validator');
const User = require('../models/User');

const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required')
    .isLength({ max: 60 }).withMessage('Name is too long'),
  body('email').trim().notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format').normalizeEmail()
    .custom(async (email) => {
      const existing = await User.findOne({ email });
      if (existing) throw new Error('Email already registered');
    }),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
  body('gender').trim().toLowerCase().isIn(['male', 'female', 'other'])
    .withMessage('Gender must be Male, Female, or Other'),
  body('age').isInt({ min: 1, max: 120 }).withMessage('Age must be between 1 and 120').toInt()
];

const loginValidation = [
  body('loginemail').trim().notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format').normalizeEmail(),
  body('loginpassword').notEmpty().withMessage('Password is required')
];

const updateProfileValidation = [
  body('updateprofilename').trim().notEmpty().withMessage('Name is required')
    .isLength({ max: 60 }).withMessage('Name is too long'),
  body('gender').trim().toLowerCase().isIn(['male', 'female', 'other'])
    .withMessage('Gender must be Male, Female, or Other'),
  body('age').isInt({ min: 1, max: 120 }).withMessage('Age must be between 1 and 120').toInt()
];

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).render('error', { error: errors.array()[0].msg });
  }
  next();
}

module.exports = { registerValidation, loginValidation, updateProfileValidation, validate };
