-- Password Reset Tokens Table
-- This table stores password reset tokens with expiration

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  used_at TIMESTAMP NULL,
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_password_reset_token_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_user_id ON password_reset_tokens(user_id);

-- Clean up expired tokens (run periodically)
-- DELETE FROM password_reset_tokens WHERE expires_at < NOW() AND used_at IS NULL;

COMMENT ON TABLE password_reset_tokens IS 'Stores password reset tokens with 1-hour expiration';
COMMENT ON COLUMN password_reset_tokens.token_hash IS 'SHA256 hash of the reset token';
COMMENT ON COLUMN password_reset_tokens.expires_at IS 'Token expiration timestamp (1 hour from creation)';
COMMENT ON COLUMN password_reset_tokens.used_at IS 'Timestamp when token was used (NULL if unused)';
