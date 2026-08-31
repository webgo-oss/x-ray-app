const { doubleCsrf } = require('csrf-csrf');

const {
  generateCsrfToken,
  doubleCsrfProtection,
  invalidCsrfTokenError
} = doubleCsrf({
  getSecret: () => process.env.SESSION_SECRET,
  // Binds the CSRF token to the visitor's session so it can't be replayed cross-session.
  getSessionIdentifier: (req) => req.session.id,
  cookieName: 'csrf-token',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production', // must be false on plain http://localhost dev
    path: '/'
  },
  // Forms post the token as a hidden field, not an x-csrf-token header.
  getCsrfTokenFromRequest: (req) => req.body?._csrf
});

module.exports = { generateCsrfToken, doubleCsrfProtection, invalidCsrfTokenError };
