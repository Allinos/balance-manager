'use strict';

require('dotenv').config();

/**
 * Centralised, validated environment configuration.
 * Access config values from here instead of reading process.env directly.
 */
const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  sessionSecret: process.env.SESSION_SECRET || 'insecure-dev-secret-change-me',
  currencySymbol: process.env.CURRENCY_SYMBOL || '₹',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'balance_manager',
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10,
  },
  seed: {
    adminName: process.env.SEED_ADMIN_NAME || 'Administrator',
    adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@example.com',
    adminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin@123',
  },
};

config.isProd = config.env === 'production';

module.exports = config;
