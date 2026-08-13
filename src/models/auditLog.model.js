'use strict';

const { query } = require('../config/db');

const AuditLogModel = {
  async create({ userId, userName, action, entity, entityId, details, ip }) {
    await query(
      `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId || null,
        userName || null,
        action,
        entity,
        entityId != null ? String(entityId) : null,
        details ? JSON.stringify(details) : null,
        ip || null,
      ]
    );
  },

  async findAll({ entity, action, limit = 200, offset = 0 } = {}) {
    let sql = 'SELECT * FROM audit_logs';
    const params = [];
    const where = [];
    if (entity) {
      where.push('entity = ?');
      params.push(entity);
    }
    if (action) {
      where.push('action = ?');
      params.push(action);
    }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    return query(sql, params);
  },

  async count({ entity, action } = {}) {
    let sql = 'SELECT COUNT(*) AS c FROM audit_logs';
    const params = [];
    const where = [];
    if (entity) {
      where.push('entity = ?');
      params.push(entity);
    }
    if (action) {
      where.push('action = ?');
      params.push(action);
    }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    const rows = await query(sql, params);
    return rows[0].c;
  },
};

module.exports = AuditLogModel;
