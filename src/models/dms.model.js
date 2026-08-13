'use strict';

const { query } = require('../config/db');

const DmsModel = {
  async findAll({ start, end, status } = {}) {
    let sql = 'SELECT * FROM dms_deposits';
    const params = [];
    const where = [];
    if (start && end) {
      where.push('dms_date BETWEEN ? AND ?');
      params.push(start, end);
    }
    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY dms_date DESC, id DESC';
    return query(sql, params);
  },

  async findById(id) {
    const rows = await query('SELECT * FROM dms_deposits WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async create(data) {
    const result = await query(
      `INSERT INTO dms_deposits
        (dms_date, dms_amount, receipt_amount, variance, status, reference_no, remarks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.dms_date,
        data.dms_amount,
        data.receipt_amount,
        data.variance,
        data.status,
        data.reference_no || null,
        data.remarks || null,
        data.created_by || null,
      ]
    );
    return this.findById(result.insertId);
  },

  async update(id, data) {
    await query(
      `UPDATE dms_deposits SET
        dms_date = ?, dms_amount = ?, receipt_amount = ?, variance = ?,
        status = ?, reference_no = ?, remarks = ?
       WHERE id = ?`,
      [
        data.dms_date,
        data.dms_amount,
        data.receipt_amount,
        data.variance,
        data.status,
        data.reference_no || null,
        data.remarks || null,
        id,
      ]
    );
    return this.findById(id);
  },

  async remove(id) {
    await query('DELETE FROM dms_deposits WHERE id = ?', [id]);
  },

  async summary({ start, end } = {}) {
    let sql = `SELECT
        COALESCE(SUM(dms_amount),0)     AS dms_amount,
        COALESCE(SUM(receipt_amount),0) AS receipt_amount,
        COALESCE(SUM(variance),0)       AS variance,
        SUM(status = 'pending')         AS pending,
        SUM(status = 'reconciled')      AS reconciled,
        SUM(status = 'mismatch')        AS mismatch,
        COUNT(*)                        AS entries
      FROM dms_deposits`;
    const params = [];
    if (start && end) {
      sql += ' WHERE dms_date BETWEEN ? AND ?';
      params.push(start, end);
    }
    const rows = await query(sql, params);
    return rows[0];
  },
};

module.exports = DmsModel;
