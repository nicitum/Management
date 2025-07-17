require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const apiRouter = require('./api');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001; // Changed port to 3001
app.use(cors());

app.use(express.json());

// MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test database connection
pool.getConnection((err, connection) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    return;
  }
  console.log('Successfully connected to MySQL database');
  connection.release();
});

// Add database to request object
app.use((req, res, next) => {
  req.db = pool;
  next();
});

// Use API routes
app.use('/api', apiRouter);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});