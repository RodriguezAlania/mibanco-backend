const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'bd_core_financiero_MiBanco',
  user: 'postgres',
  password: '12345678',
});

module.exports = pool;

