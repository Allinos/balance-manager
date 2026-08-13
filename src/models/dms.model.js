'use strict';

const { query } = require('../config/db');

/**
 * Simplified DMS deposit records.
 * Fields: date, payment_mode (Cash|Online), account, amount,
 *         status (pending|on_hold|completed), deposited_by, remarks.
 * A DMS deposit is an outflow that reduces the running balance
 * (and available cash when the payment mode is Cash).
 */
const DmsModel = {
  async findAll({ start, end, status, mode } = {}) {
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
    if (mode) {
      where.push('payment_mode = ?');
      params.push(mode);
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
        (dms_date, payment_mode, account, amount, status, deposited_by, remarks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.dms_date,
        data.payment_mode,
        data.account || null,
        data.amount,
        data.status,
        data.deposited_by || null,
        data.remarks || null,
        data.created_by || null,
      ]
    );
    return this.findById(result.insertId);
  },

  async update(id, data) {
    await query(
      `UPDATE dms_deposits SET
        dms_date = ?, payment_mode = ?, account = ?, amount = ?,
        status = ?, deposited_by = ?, remarks = ?
       WHERE id = ?`,
      [
        data.dms_date,
        data.payment_mode,
        data.account || null,
        data.amount,
        data.status,
        data.deposited_by || null,
        data.remarks || null,
        id,
      ]
    );
    return this.findById(id);
  },

  async remove(id) {
    await query('DELETE FROM dms_deposits WHERE id = ?', [id]);
  },

  async totals({ start, end } = {}) {
    let sql = `SELECT
        COALESCE(SUM(amount),0)                                   AS amount,
        COALESCE(SUM(CASE WHEN payment_mode='Cash'   THEN amount ELSE 0 END),0) AS cash,
        COALESCE(SUM(CASE WHEN payment_mode='Online' THEN amount ELSE 0 END),0) AS online,
        SUM(status='pending')   AS pending,
        SUM(status='on_hold')   AS on_hold,
        SUM(status='completed') AS completed,
        COUNT(*)                AS entries
      FROM dms_deposits`;
    const params = [];
    if (start && end) {
      sql += ' WHERE dms_date BETWEEN ? AND ?';
      params.push(start, end);
    }
    const rows = await query(sql, params);
    return rows[0];
  },

  /**
   * Total DMS deposited into each account → Map<accountName, amount>.
   * This is the running "account balance" (money moved into the account).
   */
  async totalsByAccount() {
    const rows = await query(
      `SELECT account, COALESCE(SUM(amount),0) AS total
       FROM dms_deposits WHERE account IS NOT NULL AND account <> ''
       GROUP BY account`
    );
    const map = new Map();
    for (const r of rows) map.set(r.account, Number(r.total));
    return map;
  },

  /** Outflows grouped by date → Map<date, { total, cash, online }>. */
  async byDate() {
    const rows = await query(
      `SELECT dms_date,
              COALESCE(SUM(amount),0) AS total,
              COALESCE(SUM(CASE WHEN payment_mode='Cash' THEN amount ELSE 0 END),0) AS cash,
              COALESCE(SUM(CASE WHEN payment_mode='Online' THEN amount ELSE 0 END),0) AS online
       FROM dms_deposits GROUP BY dms_date`
    );
    const map = new Map();
    for (const r of rows) {
      map.set(r.dms_date, { total: Number(r.total), cash: Number(r.cash), online: Number(r.online) });
    }
    return map;
  },
};

module.exports = DmsModel;
