'use strict';

const { query } = require('../config/db');

const DepositModel = {
  async findAll({ start, end } = {}) {
    let sql = 'SELECT * FROM deposits';
    const params = [];
    if (start && end) {
      sql += ' WHERE deposit_date BETWEEN ? AND ?';
      params.push(start, end);
    }
    sql += ' ORDER BY deposit_date DESC, id DESC';
    return query(sql, params);
  },

  async findById(id) {
    const rows = await query('SELECT * FROM deposits WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async create(data) {
    const result = await query(
      `INSERT INTO deposits
        (deposit_date, amount, mode, deposited_by, reference_no, remarks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.deposit_date,
        data.amount,
        data.mode,
        data.deposited_by || null,
        data.reference_no || null,
        data.remarks || null,
        data.created_by || null,
      ]
    );
    return this.findById(result.insertId);
  },

  async update(id, data) {
    await query(
      `UPDATE deposits SET
        deposit_date = ?, amount = ?, mode = ?, deposited_by = ?,
        reference_no = ?, remarks = ?
       WHERE id = ?`,
      [
        data.deposit_date,
        data.amount,
        data.mode,
        data.deposited_by || null,
        data.reference_no || null,
        data.remarks || null,
        id,
      ]
    );
    return this.findById(id);
  },

  async remove(id) {
    await query('DELETE FROM deposits WHERE id = ?', [id]);
  },

  /**
   * Deposits grouped by date → Map<date, { total, cash }>.
   * `cash` counts modes that physically remove cash on hand (Cash, Bank).
   */
  async byDate() {
    const rows = await query(
      `SELECT deposit_date,
              COALESCE(SUM(amount),0) AS total,
              COALESCE(SUM(CASE WHEN mode IN ('Cash','Bank') THEN amount ELSE 0 END),0) AS cash
       FROM deposits GROUP BY deposit_date`
    );
    const map = new Map();
    for (const r of rows) map.set(r.deposit_date, { total: Number(r.total), cash: Number(r.cash) });
    return map;
  },

  async totals({ start, end } = {}) {
    let sql = 'SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS entries FROM deposits';
    const params = [];
    if (start && end) {
      sql += ' WHERE deposit_date BETWEEN ? AND ?';
      params.push(start, end);
    }
    const rows = await query(sql, params);
    return rows[0];
  },
};

module.exports = DepositModel;
