'use strict';

const { query } = require('../config/db');

/** Managed list of accounts used by DMS deposits. */
const AccountModel = {
  async findAll() {
    return query('SELECT * FROM accounts ORDER BY name ASC');
  },

  async findActive() {
    return query('SELECT * FROM accounts WHERE is_active = 1 ORDER BY name ASC');
  },

  async findById(id) {
    const rows = await query('SELECT * FROM accounts WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async create({ name, isActive = 1 }) {
    const result = await query(
      'INSERT INTO accounts (name, is_active) VALUES (?, ?)',
      [name, isActive ? 1 : 0]
    );
    return this.findById(result.insertId);
  },

  async update(id, { name, isActive }) {
    await query('UPDATE accounts SET name = ?, is_active = ? WHERE id = ?', [
      name,
      isActive ? 1 : 0,
      id,
    ]);
    return this.findById(id);
  },

  async remove(id) {
    await query('DELETE FROM accounts WHERE id = ?', [id]);
  },
};

module.exports = AccountModel;
