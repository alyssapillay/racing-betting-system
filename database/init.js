require('dotenv').config();
const { initDb } = require('./db');
initDb();
process.exit(0);
