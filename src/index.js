/**
 * AI-Powered Performance Ratings MVP
 * Main Application Entry Point
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Import routes
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public folder
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api', apiRoutes);

// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database
    const db = require('./db/database');
    await db.init();
    console.log('Database initialized');

    // Create default admin user if not exists
    const adminExists = db.get("SELECT id FROM users WHERE email = 'admin@company.com'");
    if (!adminExists) {
      const hashedPassword = bcrypt.hashSync('admin123', 10);
      db.run(
        `INSERT INTO users (id, email, password, name, role, department, position) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), 'admin@company.com', hashedPassword, 'System Admin', 'ADMIN', 'IT', 'Administrator']
      );
      console.log('Default admin user created');
    }

    // Create default rating period if none exists
    const periodExists = db.get("SELECT id FROM rating_periods LIMIT 1");
    if (!periodExists) {
      const now = new Date();
      const year = now.getFullYear();
      db.run(
        `INSERT INTO rating_periods (id, name, start_date, end_date) 
         VALUES (?, ?, ?, ?)`,
        [uuidv4(), `${year} Q1`, `${year}-01-01`, `${year}-03-31`]
      );
      console.log('Default rating period created');
    }

    // Start server
    app.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   AI-Powered Performance Ratings MVP                         ║
║   Server running at http://localhost:${PORT}                    ║
║                                                              ║
║   Default admin login:                                       ║
║   Email: admin@company.com                                   ║
║   Password: admin123                                         ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;