/**
 * Authentication Service
 * Handles user registration, login, and token management
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || 'performance-ratings-secret-key-2024';
const JWT_EXPIRY = '24h';

class AuthService {
  /**
   * Register a new user
   */
  static register(email, password, name, role, managerId = null, department = null, position = null) {
    // Check if user already exists
    const existingUser = db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser) {
      throw new Error('User already exists');
    }

    // Hash password
    const hashedPassword = bcrypt.hashSync(password, 10);
    const userId = uuidv4();

    // Insert user
    db.run(
      `INSERT INTO users (id, email, password, name, role, manager_id, department, position) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, email, hashedPassword, name, role, managerId || null, department || null, position || null]
    );

    // Generate token
    const token = jwt.sign({ id: userId, email, role }, JWT_SECRET, { expiresIn: JWT_EXPIRY });

    return {
      user: { id: userId, email, name, role, department, position },
      token
    };
  }

  /**
   * Login user
   */
  static login(email, password) {
    const user = db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
      throw new Error('Invalid credentials');
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRY });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        department: user.department,
        position: user.position,
        manager_id: user.manager_id,
        years_in_role: user.years_in_role,
        career_goals: user.career_goals
      },
      token
    };
  }

  /**
   * Verify JWT token
   */
  static verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  /**
   * Get user by ID
   */
  static getUserById(userId) {
    const user = db.get('SELECT id, email, name, role, manager_id, department, position, years_in_role, career_goals FROM users WHERE id = ?', [userId]);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  /**
   * Get all employees for a manager
   */
  static getTeamMembers(managerId) {
    return db.all(
      `SELECT u.*, m.name as manager_name 
       FROM users u 
       LEFT JOIN users m ON u.manager_id = m.id 
       WHERE u.manager_id = ?`,
      [managerId]
    );
  }

  /**
   * Get all managers
   */
  static getAllManagers() {
    return db.all("SELECT * FROM users WHERE role = 'MANAGER'");
  }

  /**
   * Update user profile
   */
  static updateProfile(userId, updates) {
    const allowedFields = ['name', 'department', 'position', 'years_in_role', 'career_goals'];
    const setClause = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (setClause.length === 0) {
      throw new Error('No valid fields to update');
    }

    setClause.push('updated_at = CURRENT_TIMESTAMP');
    values.push(userId);

    db.run(`UPDATE users SET ${setClause.join(', ')} WHERE id = ?`, values);
    return this.getUserById(userId);
  }
}

module.exports = AuthService;