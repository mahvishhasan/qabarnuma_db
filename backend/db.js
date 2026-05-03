const sql = require('mssql');

// Load .env only when running locally outside Docker
if (!process.env.DB_SERVER || process.env.DB_SERVER === 'localhost') {
  require('dotenv').config();
}

const config = {
  user:     process.env.DB_USER     || 'sa',
  password: process.env.DB_PASSWORD || 'Qabar1234!',
  server:   process.env.DB_SERVER   || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 1433,
  database: process.env.DB_NAME     || 'QabarNuma',
  options: {
    encrypt:                false,
    trustServerCertificate: true,
  },
  pool: {
    max:                  10,
    min:                  0,
    idleTimeoutMillis:    30000,
    acquireTimeoutMillis: 20000,
  },
  connectionTimeout: 20000,
  requestTimeout:    20000,
};

let pool = null;

async function getPool() {
  if (pool) {
    try {
      await pool.request().query('SELECT 1');
      return pool;
    } catch (_) {
      try { await pool.close(); } catch (__) {}
      pool = null;
    }
  }

  // Retry up to 10 times — handles slow SQL Server startup in Docker
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      pool = await sql.connect(config);
      pool.on('error', err => {
        console.error('[DB] Pool error:', err.message);
        pool = null;
      });
      console.log(`[DB] Connected to ${config.server}:${config.port}/${config.database}`);
      return pool;
    } catch (err) {
      console.warn(`[DB] Attempt ${attempt}/10 failed: ${err.message}`);
      if (attempt < 10) await new Promise(r => setTimeout(r, 5000));
      else throw err;
    }
  }
}

module.exports = { getPool, sql };
