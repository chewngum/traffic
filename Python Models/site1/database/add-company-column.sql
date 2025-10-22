-- Add company column to users table
-- This migration adds a company field to store user's organization

ALTER TABLE users
ADD COLUMN IF NOT EXISTS company VARCHAR(255);

-- Add index for faster searching by company
CREATE INDEX IF NOT EXISTS idx_users_company ON users(company);

-- Update existing users to have NULL company (optional - remove if not needed)
-- Guest users will have NULL company
UPDATE users
SET company = NULL
WHERE company IS NULL;

-- Optional: Update specific users with known companies
-- UPDATE users SET company = 'Example Company' WHERE username = 'example_user';
