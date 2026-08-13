'use strict';

const AuditLogModel = require('../models/auditLog.model');

exports.list = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const perPage = 50;
  const offset = (page - 1) * perPage;
  const { entity, action } = req.query;

  const [logs, total] = await Promise.all([
    AuditLogModel.findAll({ entity, action, limit: perPage, offset }),
    AuditLogModel.count({ entity, action }),
  ]);

  res.render('audit/list', {
    title: 'Audit Logs',
    active: 'audit',
    logs,
    filters: { entity: entity || '', action: action || '' },
    pagination: {
      page,
      perPage,
      total,
      pages: Math.max(1, Math.ceil(total / perPage)),
    },
  });
};
