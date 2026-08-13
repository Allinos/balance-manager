'use strict';

/**
 * Role hierarchy (higher number = more privileges).
 *   viewer   – read only
 *   operator – create / edit collections, deposits, dms
 *   manager  – + delete, reports, reconciliation
 *   admin    – + user management, audit logs, everything
 */
const ROLE_LEVEL = { viewer: 1, operator: 2, manager: 3, admin: 4 };

function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) return next();
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.session.returnTo = req.originalUrl;
  req.flash('error', 'Please sign in to continue.');
  return res.redirect('/login');
}

/**
 * Require a minimum role. Usage: requireRole('manager')
 */
function requireRole(minRole) {
  const min = ROLE_LEVEL[minRole] || 99;
  return (req, res, next) => {
    const user = req.session && req.session.user;
    if (!user) return res.redirect('/login');
    if ((ROLE_LEVEL[user.role] || 0) >= min) return next();
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.status(403).render('errors/403', { title: 'Forbidden' });
  };
}

/** Convenience guard for admin-only areas. */
const requireAdmin = requireRole('admin');

module.exports = { isAuthenticated, requireRole, requireAdmin, ROLE_LEVEL };
