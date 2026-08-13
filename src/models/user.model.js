'use strict';

const { query } = require('../config/db');

const UserModel = {
  async findAll() {
    return query(
      'SELECT id, name, email, role, is_active, last_login_at, created_at FROM users ORDER BY created_at DESC'
    );
  },

  async findById(id) {
    const rows = await query(
      'SELECT id, name, email, role, is_active, last_login_at, created_at FROM users WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  },

  async findByEmail(email) {
    const rows = await query('SELECT * FROM users WHERE email = ?', [email]);
    return rows[0] || null;
  },

  async create({ name, email, passwordHash, role, isActive = 1 }) {
    const result = await query(
      'INSERT INTO users (name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?)',
      [name, email, passwordHash, role, isActive ? 1 : 0]
    );
    return this.findById(result.insertId);
  },

  async update(id, { name, email, role, isActive }) {
    await query(
      'UPDATE users SET name = ?, email = ?, role = ?, is_active = ? WHERE id = ?',
      [name, email, role, isActive ? 1 : 0, id]
    );
    return this.findById(id);
  },

  async updatePassword(id, passwordHash) {
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, id]);
  },

  async touchLogin(id) {
    await query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [id]);
  },

  async remove(id) {
    await query('DELETE FROM users WHERE id = ?', [id]);
  },

  async count() {
    const rows = await query('SELECT COUNT(*) AS c FROM users');
    return rows[0].c;
  },
};

module.exports = UserModel;
