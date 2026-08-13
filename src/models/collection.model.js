'use strict';

const { query } = require('../config/db');

const CollectionModel = {
  async findAll({ start, end } = {}) {
    let sql =
      'SELECT * FROM collections';
    const params = [];
    if (start && end) {
      sql += ' WHERE collection_date BETWEEN ? AND ?';
      params.push(start, end);
    }
    sql += ' ORDER BY collection_date ASC';
    return query(sql, params);
  },

  async findAllDesc({ start, end, limit } = {}) {
    let sql = 'SELECT * FROM collections';
    const params = [];
    if (start && end) {
      sql += ' WHERE collection_date BETWEEN ? AND ?';
      params.push(start, end);
    }
    sql += ' ORDER BY collection_date DESC';
    if (limit) {
      // Inline a sanitised integer – MySQL 8 rejects bound LIMIT values.
      sql += ` LIMIT ${Math.max(1, parseInt(limit, 10) || 1)}`;
    }
    return query(sql, params);
  },

  async findById(id) {
    const rows = await query('SELECT * FROM collections WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async findByDate(date) {
    const rows = await query('SELECT * FROM collections WHERE collection_date = ?', [date]);
    return rows[0] || null;
  },

  async create(data) {
    const result = await query(
      `INSERT INTO collections
        (collection_date, online, cash, credit_balance, total_collection,
         old_balance_collection, opening_balance, remaining_balance,
         available_cash, remarks, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.collection_date,
        data.online,
        data.cash,
        data.credit_balance,
        data.total_collection,
        data.old_balance_collection,
        data.opening_balance,
        data.remaining_balance,
        data.available_cash,
        data.remarks || null,
        data.created_by || null,
        data.created_by || null,
      ]
    );
    return this.findById(result.insertId);
  },

  async update(id, data) {
    await query(
      `UPDATE collections SET
        collection_date = ?, online = ?, cash = ?, credit_balance = ?,
        total_collection = ?, old_balance_collection = ?, remarks = ?, updated_by = ?
       WHERE id = ?`,
      [
        data.collection_date,
        data.online,
        data.cash,
        data.credit_balance,
        data.total_collection,
        data.old_balance_collection,
        data.remarks || null,
        data.updated_by || null,
        id,
      ]
    );
    return this.findById(id);
  },

  /** Persist recalculated ledger fields (used by the ledger service). */
  async updateLedgerFields(id, { opening_balance, remaining_balance, available_cash }) {
    await query(
      'UPDATE collections SET opening_balance = ?, remaining_balance = ?, available_cash = ? WHERE id = ?',
      [opening_balance, remaining_balance, available_cash, id]
    );
  },

  async remove(id) {
    await query('DELETE FROM collections WHERE id = ?', [id]);
  },

  /** Aggregated totals for a date range (used by dashboard & reports). */
  async totals({ start, end } = {}) {
    let sql = `SELECT
        COALESCE(SUM(online),0)            AS online,
        COALESCE(SUM(cash),0)             AS cash,
        COALESCE(SUM(credit_balance),0)   AS credit_balance,
        COALESCE(SUM(total_collection),0) AS total_collection,
        COUNT(*)                          AS entries
      FROM collections`;
    const params = [];
    if (start && end) {
      sql += ' WHERE collection_date BETWEEN ? AND ?';
      params.push(start, end);
    }
    const rows = await query(sql, params);
    return rows[0];
  },

  /** Min & max collection dates (null when empty). */
  async dateBounds() {
    const rows = await query(
      'SELECT MIN(collection_date) AS min, MAX(collection_date) AS max FROM collections'
    );
    return { min: rows[0].min, max: rows[0].max };
  },
};

module.exports = CollectionModel;
