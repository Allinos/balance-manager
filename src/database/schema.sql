-- ============================================================
--  Balance Manager – MySQL schema
--  Charset: utf8mb4 (rupee symbol / unicode safe)
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------
--  Users & roles
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name           VARCHAR(120)  NOT NULL,
  email          VARCHAR(160)  NOT NULL,
  password_hash  VARCHAR(255)  NOT NULL,
  role           ENUM('admin','manager','operator','viewer') NOT NULL DEFAULT 'operator',
  is_active      TINYINT(1)    NOT NULL DEFAULT 1,
  last_login_at  DATETIME      NULL,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
--  Daily collections
--  total_collection = online + cash + credit_balance
--  opening_balance  = previous day's remaining_balance
--  remaining_balance= opening_balance + total_collection
--                     + old_balance_collection - deposits_of_day
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS collections (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  collection_date        DATE           NOT NULL,
  online                 DECIMAL(14,2)  NOT NULL DEFAULT 0.00,
  cash                   DECIMAL(14,2)  NOT NULL DEFAULT 0.00,
  credit_balance         DECIMAL(14,2)  NOT NULL DEFAULT 0.00,
  total_collection       DECIMAL(14,2)  NOT NULL DEFAULT 0.00,
  old_balance_collection DECIMAL(14,2)  NOT NULL DEFAULT 0.00,
  opening_balance        DECIMAL(14,2)  NOT NULL DEFAULT 0.00,
  remaining_balance      DECIMAL(14,2)  NOT NULL DEFAULT 0.00,
  available_cash         DECIMAL(14,2)  NOT NULL DEFAULT 0.00,
  remarks                VARCHAR(255)   NULL,
  created_by             INT UNSIGNED   NULL,
  updated_by             INT UNSIGNED   NULL,
  created_at             DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_collections_date (collection_date),
  KEY fk_collections_created_by (created_by),
  CONSTRAINT fk_collections_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
--  Deposits (money moved to bank / online)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deposits (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  deposit_date   DATE          NOT NULL,
  amount         DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  mode           ENUM('Bank','Online','Cash','Cheque') NOT NULL DEFAULT 'Bank',
  deposited_by   VARCHAR(120)  NULL,
  reference_no   VARCHAR(120)  NULL,
  remarks        VARCHAR(255)  NULL,
  created_by     INT UNSIGNED  NULL,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_deposits_date (deposit_date),
  KEY fk_deposits_created_by (created_by),
  CONSTRAINT fk_deposits_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
--  DMS deposits & reconciliation
--  variance = dms_amount - receipt_amount
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dms_deposits (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  dms_date       DATE          NOT NULL,
  dms_amount     DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  receipt_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  variance       DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  status         ENUM('pending','reconciled','mismatch') NOT NULL DEFAULT 'pending',
  reference_no   VARCHAR(120)  NULL,
  remarks        VARCHAR(255)  NULL,
  created_by     INT UNSIGNED  NULL,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_dms_date (dms_date),
  KEY fk_dms_created_by (created_by),
  CONSTRAINT fk_dms_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
--  Audit log
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED  NULL,
  user_name   VARCHAR(120)  NULL,
  action      VARCHAR(40)   NOT NULL,
  entity      VARCHAR(40)   NOT NULL,
  entity_id   VARCHAR(40)   NULL,
  details     JSON          NULL,
  ip_address  VARCHAR(64)   NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_entity (entity, entity_id),
  KEY idx_audit_user (user_id),
  KEY idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
