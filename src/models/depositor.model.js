'use strict';

const { query } = require('../config/db');

/** Managed list of people who can make deposits ("Deposit By"). */
const DepositorModel = {
  async findAll() {
    return query('SELECT * FROM depositors ORDER BY name ASC');
  },

  async findActive() {
    return query('SELECT * FROM depositors WHERE is_active = 1 ORDER BY name ASC');
  },

  async findById(id) {
    const rows = await query('SELECT * FROM depositors WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async create({ name, isActive = 1 }) {
    const result = await query(
      'INSERT INTO depositors (name, is_active) VALUES (?, ?)',
      [name, isActive ? 1 : 0]
    );
    return this.findById(result.insertId);
  },

  async update(id, { name, isActive }) {
    await query('UPDATE depositors SET name = ?, is_active = ? WHERE id = ?', [
      name,
      isActive ? 1 : 0,
      id,
    ]);
    return this.findById(id);
  },

  async remove(id) {
    await query('DELETE FROM depositors WHERE id = ?', [id]);
  },
};

module.exports = DepositorModel;
