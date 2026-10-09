CREATE TABLE IF NOT EXISTS app_sessions (
  tokenHash CHAR(64) PRIMARY KEY,
  userId VARCHAR(191) NOT NULL,
  csrf CHAR(48) NOT NULL,
  expires BIGINT NOT NULL,
  KEY session_expiry (expires),
  FOREIGN KEY (userId) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
