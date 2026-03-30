/**
 * API Routes
 * All REST API endpoints for the application
 */

const express = require('express');
const router = express.Router();

// Middleware to check authentication
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const AuthService = require('../services/authService');
    const decoded = AuthService.verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Middleware to check role
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  };
};

// ============ Authentication Routes ============

// Register (Admin only can create other users)
router.post('/auth/register', async (req, res) => {
  try {
    const AuthService = require('../services/authService');
    const { email, password, name, role, managerId, department, position } = req.body;
    
    const result = AuthService.register(email, password, name, role, managerId, department, position);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Login
router.post('/auth/login', async (req, res) => {
  try {
    const AuthService = require('../services/authService');
    const { email, password } = req.body;
    
    const result = AuthService.login(email, password);
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

// Get current user
router.get('/auth/me', authenticate, async (req, res) => {
  try {
    const AuthService = require('../services/authService');
    const user = AuthService.getUserById(req.user.id);
    res.json(user);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

// ============ Admin Routes ============

// Get all users (Admin)
router.get('/admin/users', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const db = require('../db/database');
    const users = db.all('SELECT id, email, name, role, manager_id, department, position, created_at FROM users ORDER BY name');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create goal (Admin)
router.post('/admin/goals', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const GoalService = require('../services/goalService');
    const { title, description, successCriteria, competencies, contextForAI } = req.body;
    
    const goal = GoalService.createGoal(title, description, successCriteria, competencies, contextForAI, req.user.id);
    res.json(goal);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all goals (Admin)
router.get('/admin/goals', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const GoalService = require('../services/goalService');
    const goals = GoalService.getAllGoals();
    res.json(goals);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all managers (for assignment)
router.get('/admin/managers', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const AuthService = require('../services/authService');
    const managers = AuthService.getAllManagers();
    res.json(managers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ Manager Routes ============

// Get team members
router.get('/manager/team', authenticate, requireRole('MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const AuthService = require('../services/authService');
    const team = AuthService.getTeamMembers(req.user.id);
    res.json(team);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Assign goal to employee
router.post('/manager/assign-goal', authenticate, requireRole('MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const GoalService = require('../services/goalService');
    const { employeeId, goalId, customizedTitle, customizedCriteria } = req.body;
    
    const assignment = GoalService.assignGoal(employeeId, goalId, customizedTitle, customizedCriteria, req.user.id);
    res.json(assignment);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get team goals
router.get('/manager/team-goals', authenticate, requireRole('MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const GoalService = require('../services/goalService');
    const teamGoals = GoalService.getTeamGoals(req.user.id);
    res.json(teamGoals);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get team report (AI-generated)
router.get('/manager/team-report/:period', authenticate, requireRole('MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const AIService = require('../services/aiService');
    const report = await AIService.generateTeamReport(req.user.id, req.params.period);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Record life event for employee
router.post('/manager/employees/:employeeId/life-event', authenticate, requireRole('MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const EmpathyService = require('../services/empathyService');
    const { event_type, start_date, end_date, reason } = req.body;
    
    const event = EmpathyService.recordLifeEvent(req.params.employeeId, event_type, start_date, end_date, reason);
    res.json(event);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Finalize rating with empathy adjustment
router.post('/manager/ratings/:employeeId/finalize', authenticate, requireRole('MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const EmpathyService = require('../services/empathyService');
    const db = require('../db/database');
    const { raw_score, rating_period } = req.body;
    
    // Get rating period dates
    const period = db.get('SELECT * FROM rating_periods WHERE id = ?', [rating_period]);
    if (!period) {
      throw new Error('Rating period not found');
    }

    // Apply empathy adjustments
    const adjusted = EmpathyService.calculateAdjustedRating(
      req.params.employeeId,
      raw_score,
      period.start_date,
      period.end_date
    );

    // Save final rating
    const ratingId = require('uuid').v4();
    db.run(
      `INSERT INTO ratings (id, employee_id, manager_id, rating_period, raw_score, final_score, adjustment_explanation, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [ratingId, req.params.employeeId, req.user.id, rating_period, adjusted.raw_score, adjusted.adjusted_score, adjusted.explanation, new Date().toISOString()]
    );

    res.json({
      id: ratingId,
      raw_score: adjusted.raw_score,
      final_score: adjusted.adjusted_score,
      explanation: adjusted.explanation
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get employee recommendations
router.get('/manager/employees/:employeeId/recommendations', authenticate, requireRole('MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const db = require('../db/database');
    const recs = db.all(
      `SELECT * FROM recommendations WHERE employee_id = ? ORDER BY priority DESC`,
      [req.params.employeeId]
    );
    res.json(recs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ Employee Routes ============

// Get my goals
router.get('/employee/goals', authenticate, async (req, res) => {
  try {
    const GoalService = require('../services/goalService');
    const goals = GoalService.getEmployeeGoals(req.user.id);
    res.json(goals);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Submit progress update
router.post('/employee/progress/:employeeGoalId', authenticate, async (req, res) => {
  try {
    const GoalService = require('../services/goalService');
    const { completion_percentage, update_text, evidence, time_period } = req.body;
    
    const progress = GoalService.submitProgress(
      req.params.employeeGoalId,
      completion_percentage,
      update_text,
      evidence,
      time_period
    );
    res.json({ success: true, progress_id: progress.id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get progress history for a goal
router.get('/employee/progress/:employeeGoalId', authenticate, async (req, res) => {
  try {
    const GoalService = require('../services/goalService');
    const history = GoalService.getProgressHistory(req.params.employeeGoalId);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get AI feedback for my goals
router.get('/employee/feedback', authenticate, async (req, res) => {
  try {
    const db = require('../db/database');
    const feedback = db.all(
      `SELECT f.*, g.title as goal_title
       FROM ai_feedback f
       JOIN employee_goals eg ON f.goal_id = eg.id
       JOIN goals g ON eg.goal_id = g.id
       WHERE eg.employee_id = ?
       ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    res.json(feedback);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get my recommendations
router.get('/employee/recommendations', authenticate, async (req, res) => {
  try {
    const db = require('../db/database');
    const recs = db.all(
      `SELECT * FROM recommendations WHERE employee_id = ? ORDER BY priority DESC`,
      [req.user.id]
    );
    res.json(recs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get my ratings
router.get('/employee/ratings', authenticate, async (req, res) => {
  try {
    const db = require('../db/database');
    const ratings = db.all(
      `SELECT * FROM ratings WHERE employee_id = ? ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(ratings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get my empathy adjustments
router.get('/employee/empathy-adjustments', authenticate, async (req, res) => {
  try {
    const EmpathyService = require('../services/empathyService');
    const events = EmpathyService.getEmployeeLifeEvents(req.user.id);
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update profile
router.put('/employee/profile', authenticate, async (req, res) => {
  try {
    const AuthService = require('../services/authService');
    const updates = req.body;
    const user = AuthService.updateProfile(req.user.id, updates);
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============ Common Routes ============

// Get rating periods
router.get('/rating-periods', authenticate, async (req, res) => {
  try {
    const db = require('../db/database');
    const periods = db.all('SELECT * FROM rating_periods ORDER BY start_date DESC');
    res.json(periods);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create rating period (Admin only)
router.post('/admin/rating-periods', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const db = require('../db/database');
    const { name, start_date, end_date } = req.body;
    const id = require('uuid').v4();
    
    db.run(
      `INSERT INTO rating_periods (id, name, start_date, end_date, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, name, start_date, end_date, new Date().toISOString()]
    );
    
    res.json({ id, name, start_date, end_date });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;