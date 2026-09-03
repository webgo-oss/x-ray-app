const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { generateCsrfToken } = require('./csrf');

const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required')
    .isLength({ max: 60 }).withMessage('Name is too long'),
  body('email').trim().notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format').normalizeEmail()
    .custom(async (email) => {
      const existing = await User.findOne({ email });
      if (existing) throw new Error('Email already registered');
    }),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
    .matches(/[A-Za-z]/).withMessage('Password must contain at least one letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number'),
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

// Which fields to hand back to the login/register page so the user doesn't
// have to retype everything after fixing one mistake. Password is
// deliberately never included.
function oldInputFor(path, body) {
  if (path === '/register') {
    const { name, email, age, gender } = body;
    return { name, email, age, gender };
  }
  if (path === '/login') {
    return { loginemail: body.loginemail };
  }
  return {};
}

// generateCsrfToken needs a real session (double-submit cookie pattern), which
// isn't always present outside a real request — guard so this never itself
// becomes the reason a page fails to render.
function safeCsrfToken(req, res) {
  try {
    return generateCsrfToken(req, res);
  } catch (err) {
    return '';
  }
}

function validate(req, res, next) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  const message = errors.array()[0].msg;

  // Validation failures are normal, expected user input mistakes — send the
  // person back to the form with an inline message instead of the generic
  // error page, which is reserved for things actually going wrong server-side.
  if (req.path === '/register' || req.path === '/login') {
    return res.status(400).render('login', {
      error: message,
      activeForm: req.path === '/login' ? 'login' : 'register',
      oldInput: oldInputFor(req.path, req.body),
      csrfToken: safeCsrfToken(req, res)
    });
  }

  res.status(400).render('error', { error: message });
}

module.exports = { registerValidation, loginValidation, updateProfileValidation, validate };
