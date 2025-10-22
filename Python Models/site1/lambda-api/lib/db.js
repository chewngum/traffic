const { neon } = require('@neondatabase/serverless');

// Create Neon client (works in Lambda)
let sql = null;

function getDB() {
  if (!sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    sql = neon(process.env.DATABASE_URL);
  }
  return sql;
}

// Helper for queries
async function query(text, params) {
  const sql = getDB();
  try {
    const result = await sql(text, params);
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

// Helper for transactions
async function transaction(callback) {
  const sql = getDB();
  // Neon serverless handles transactions differently
  // For now, just execute the callback
  return await callback(sql);
}

module.exports = {
  getDB,
  query,
  transaction
};