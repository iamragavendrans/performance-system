/**
 * Database wrapper for sql.js (pure JavaScript SQLite)
 * Provides simple methods for CRUD operations
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', '..', 'data');
const dbPath = path.join(dataDir, 'performance.db');

let db = null;

// Initialize database
async function initDatabase() {
  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const SQL = await initSqlJs();

  // Try to load existing database
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');

  // Create tables
  createTables();

  // Save database
  saveDatabase();

  return db;
}

// Create all required tables
function createTables() {
  // 1. Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('ADMIN', 'MANAGER', 'EMPLOYEE')),
      manager_id TEXT,
      department TEXT,
      position TEXT,
      years_in_role INTEGER DEFAULT 0,
      career_goals TEXT,
      zoho_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(manager_id) REFERENCES users(id)
    )
  `);

  // 2. Goals table
  db.run(`
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      success_criteria TEXT,
      competencies TEXT,
      context_for_ai TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(created_by) REFERENCES users(id)
    )
  `);

  // 3. Employee Goals
  db.run(`
    CREATE TABLE IF NOT EXISTS employee_goals (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      goal_id TEXT NOT NULL,
      customized_title TEXT,
      customized_criteria TEXT,
      assigned_by TEXT,
      assigned_at TEXT DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'COMPLETED', 'ARCHIVED')),
      FOREIGN KEY(employee_id) REFERENCES users(id),
      FOREIGN KEY(goal_id) REFERENCES goals(id),
      FOREIGN KEY(assigned_by) REFERENCES users(id)
    )
  `);

  // 4. Progress Updates
  db.run(`
    CREATE TABLE IF NOT EXISTS progress_updates (
      id TEXT PRIMARY KEY,
      employee_goal_id TEXT NOT NULL,
      completion_percentage INTEGER DEFAULT 0,
      update_text TEXT,
      evidence TEXT,
      time_period TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(employee_goal_id) REFERENCES employee_goals(id)
    )
  `);

  // 5. AI Feedback
  db.run(`
    CREATE TABLE IF NOT EXISTS ai_feedback (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      goal_id TEXT NOT NULL,
      feedback_type TEXT,
      title TEXT,
      ai_generated_text TEXT,
      confidence_score REAL DEFAULT 0.9,
      data_sources TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(employee_id) REFERENCES users(id),
      FOREIGN KEY(goal_id) REFERENCES employee_goals(id)
    )
  `);

  // 6. Empathy Adjustments
  db.run(`
    CREATE TABLE IF NOT EXISTS empathy_adjustments (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      event_type TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      adjustment_method TEXT,
      adjustment_percentage INTEGER DEFAULT 0,
      reason_text TEXT,
      verified_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(employee_id) REFERENCES users(id),
      FOREIGN KEY(verified_by) REFERENCES users(id)
    )
  `);

  // 7. Recommendations
  db.run(`
    CREATE TABLE IF NOT EXISTS recommendations (
      id TEXT PRIMARY KEY,
      employee_id TEXT,
      manager_id TEXT,
      recommendation_type TEXT,
      title TEXT NOT NULL,
      description TEXT,
      action_items TEXT,
      priority TEXT,
      confidence_score REAL DEFAULT 0.9,
      is_actioned INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(employee_id) REFERENCES users(id),
      FOREIGN KEY(manager_id) REFERENCES users(id)
    )
  `);

  // 8. Performance Patterns
  db.run(`
    CREATE TABLE IF NOT EXISTS performance_patterns (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      pattern_type TEXT,
      description TEXT,
      frequency INTEGER DEFAULT 1,
      periods_observed TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(employee_id) REFERENCES users(id)
    )
  `);

  // 9. Ratings
  db.run(`
    CREATE TABLE IF NOT EXISTS ratings (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      manager_id TEXT NOT NULL,
      rating_period TEXT NOT NULL,
      raw_score REAL,
      final_score REAL,
      adjustment_explanation TEXT,
      feedback_summary TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(employee_id) REFERENCES users(id),
      FOREIGN KEY(manager_id) REFERENCES users(id),
      UNIQUE(employee_id, rating_period)
    )
  `);

  // 10. Team Reports
  db.run(`
    CREATE TABLE IF NOT EXISTS team_reports (
      id TEXT PRIMARY KEY,
      manager_id TEXT NOT NULL,
      period TEXT NOT NULL,
      report_data TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(manager_id) REFERENCES users(id),
      UNIQUE(manager_id, period)
    )
  `);

  // 11. Audit Logs
  db.run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor_id TEXT,
      changes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(actor_id) REFERENCES users(id)
    )
  `);

  // 12. Rating Periods
  db.run(`
    CREATE TABLE IF NOT EXISTS rating_periods (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      is_active INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 13. Life Events (for employee empathy adjustments)
  db.run(`
    CREATE TABLE IF NOT EXISTS life_events (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
      adjustment_percentage INTEGER DEFAULT 0,
      rejection_reason TEXT,
      verified_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(employee_id) REFERENCES users(id),
      FOREIGN KEY(verified_by) REFERENCES users(id)
    )
  `);

  // 14. Groups (for role-based goal mapping)
  db.run(`
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 15. Group Goals Mapping
  db.run(`
    CREATE TABLE IF NOT EXISTS group_goals (
      group_id TEXT NOT NULL,
      goal_id TEXT NOT NULL,
      PRIMARY KEY(group_id, goal_id),
      FOREIGN KEY(group_id) REFERENCES groups(id),
      FOREIGN KEY(goal_id) REFERENCES goals(id)
    )
  `);

  // 16. Custom Goals (for manager-created team goals)
  db.run(`
    CREATE TABLE IF NOT EXISTS custom_goals (
      id TEXT PRIMARY KEY,
      manager_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(manager_id) REFERENCES users(id)
    )
  `);

  // 17. Goal Files (for file uploads on goals)
  db.run(`
    CREATE TABLE IF NOT EXISTS goal_files (
      id TEXT PRIMARY KEY,
      employee_goal_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT,
      description TEXT,
      uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(employee_goal_id) REFERENCES employee_goals(id)
    )
  `);

  // Update employee_goals table to include weightage and files
  // Note: These ALTER TABLE statements may fail if columns already exist
  // We catch and ignore these errors
  try { db.run('ALTER TABLE employee_goals ADD COLUMN weightage INTEGER DEFAULT 0'); } catch (e) {}
  try { db.run('ALTER TABLE employee_goals ADD COLUMN weightage_pending_approval INTEGER DEFAULT 0'); } catch (e) {}
  try { db.run('ALTER TABLE employee_goals ADD COLUMN manager_feedback TEXT'); } catch (e) {}
  try { db.run('ALTER TABLE employee_goals ADD COLUMN is_custom INTEGER DEFAULT 0'); } catch (e) {}
  try { db.run('ALTER TABLE employee_goals ADD COLUMN latest_completion INTEGER DEFAULT 0'); } catch (e) {}

  // Update ratings table to include more detail
  try { db.run('ALTER TABLE ratings ADD COLUMN goal_completion REAL DEFAULT 0'); } catch (e) {}
  try { db.run('ALTER TABLE ratings ADD COLUMN goals_count INTEGER DEFAULT 0'); } catch (e) {}
  try { db.run('ALTER TABLE ratings ADD COLUMN empathy_adjustment REAL DEFAULT 0'); } catch (e) {}

  // Create indexes
  db.run('CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)');
  db.run('CREATE INDEX IF NOT EXISTS idx_users_manager ON users(manager_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_employee_goals_employee ON employee_goals(employee_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_employee_goals_goal ON employee_goals(goal_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_progress_updates_goal ON progress_updates(employee_goal_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_ai_feedback_employee ON ai_feedback(employee_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_ai_feedback_goal ON ai_feedback(goal_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_empathy_adjustments_employee ON empathy_adjustments(employee_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_recommendations_employee ON recommendations(employee_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_ratings_employee ON ratings(employee_id)');
  
  // Additional indexes for new tables
  try { db.run('CREATE INDEX IF NOT EXISTS idx_life_events_employee ON life_events(employee_id)'); } catch (e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_life_events_status ON life_events(status)'); } catch (e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_group_goals_group ON group_goals(group_id)'); } catch (e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_group_goals_goal ON group_goals(goal_id)'); } catch (e) {}

  // Migration: Update existing latest_completion column based on progress_updates
  migrateLatestCompletion();
}

// Migration function to populate latest_completion for existing data
function migrateLatestCompletion() {
  try {
    // Get all employee_goals with their latest progress update
    const goalsWithProgress = db.all(`
      SELECT eg.id, pu.completion_percentage
      FROM employee_goals eg
      JOIN (
        SELECT employee_goal_id, completion_percentage
        FROM progress_updates
        WHERE id IN (
          SELECT id FROM progress_updates
          GROUP BY employee_goal_id
          HAVING created_at = MAX(created_at)
        )
      ) pu ON eg.id = pu.employee_goal_id
    `);

    // Update each goal with its latest completion
    for (const goal of goalsWithProgress) {
      db.run('UPDATE employee_goals SET latest_completion = ? WHERE id = ?', 
        [goal.completion_percentage, goal.id]);
    }
  } catch (e) {
    // Ignore errors during migration (column might not exist yet)
    console.log('Migration note: latest_completion migration skipped or completed');
  }
}

// Save database to file
function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

// Helper methods - wrapper that mimics better-sqlite3 interface
const dbWrapper = {
  // Run a query that doesn't return results
  run(sql, params = []) {
    try {
      db.run(sql, params);
      saveDatabase();
      return { changes: db.getRowsModified() };
    } catch (error) {
      console.error('Database run error:', error);
      throw error;
    }
  },

  // Get a single row
  get(sql, params = []) {
    try {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      if (stmt.step()) {
        const result = stmt.getAsObject();
        stmt.free();
        return result;
      }
      stmt.free();
      return undefined;
    } catch (error) {
      console.error('Database get error:', error);
      throw error;
    }
  },

  // Get all rows
  all(sql, params = []) {
    try {
      const results = [];
      const stmt = db.prepare(sql);
      stmt.bind(params);
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      return results;
    } catch (error) {
      console.error('Database all error:', error);
      throw error;
    }
  },

  // Get wrapper that returns row as array
  getRow(sql, params = []) {
    return this.get(sql, params);
  },

  // Close database connection
  close() {
    if (db) {
      saveDatabase();
      db.close();
    }
  },

  // Initialize database
  init: initDatabase
};

module.exports = dbWrapper;