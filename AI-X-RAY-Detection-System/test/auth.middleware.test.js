const { requireAuth } = require('../middleware/auth');

function mockReqRes(session) {
  const req = { session };
  const res = { redirect: jest.fn() };
  const next = jest.fn();
  return { req, res, next };
}

describe('requireAuth', () => {
  test('calls next() when a user is present in the session', () => {
    const { req, res, next } = mockReqRes({ user: { id: 'u1' } });
    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.redirect).not.toHaveBeenCalled();
  });

  test('redirects to "/" and does not call next() when there is no user', () => {
    const { req, res, next } = mockReqRes({});
    requireAuth(req, res, next);

    expect(res.redirect).toHaveBeenCalledWith('/');
    expect(next).not.toHaveBeenCalled();
  });

  test('redirects when session.user is explicitly null', () => {
    const { req, res, next } = mockReqRes({ user: null });
    requireAuth(req, res, next);

    expect(res.redirect).toHaveBeenCalledWith('/');
    expect(next).not.toHaveBeenCalled();
  });
});
