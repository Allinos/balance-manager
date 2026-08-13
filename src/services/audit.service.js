'use strict';

const AuditLogModel = require('../models/auditLog.model');

/**
 * Record an audit entry. Never throws – auditing must not break the
 * primary operation, so failures are logged and swallowed.
 */
async function record(req, { action, entity, entityId, details }) {
  try {
    await AuditLogModel.create({
      userId: req.session?.user?.id,
      userName: req.session?.user?.name,
      action,
      entity,
      entityId,
      details,
      ip: req.ip,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[audit] failed to record entry:', err.message);
  }
}

module.exports = { record };
