const jwt = require('jsonwebtoken');

const getTokenFromCookieHeader = (cookieHeader = '') => {
  const tokenCookie = cookieHeader
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith('token='));

  if (!tokenCookie) return null;
  return decodeURIComponent(tokenCookie.substring('token='.length));
};

const socketAuthMiddleware = (socket, next) => {
  const token = getTokenFromCookieHeader(socket.handshake.headers?.cookie || '');
  if (!token) return next(new Error('Authentication required'));
  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = user;
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
};

module.exports = { getTokenFromCookieHeader, socketAuthMiddleware };
