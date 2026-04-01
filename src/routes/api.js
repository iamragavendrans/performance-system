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

// Helper to verify manager has permission over employee
function validateManagerEmployee(managerId, employeeId, db) {
  const employee = db.prepare('SELECT manager_id FROM users WHERE id = ?').get(employeeId);
  return employee && employee.manager_id === managerId;
}

// ============ Authentication Routes ============

// Register (Admin only can create other users)
router.post('/auth/register', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const AuthService = require('../services/authService');
    const { email, password, name, role, managerId, department, position } = req.body;
    
    // Validate required fields
    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'Email, password, name, and role are required' });
    }
    
    // Validate role
    const validRoles = ['ADMIN', 'MANAGER', 'EMPLOYEE'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be ADMIN, MANAGER, or EMPLOYEE' });
    }
    
    const result = AuthService.register(email, password, name, role, managerId, department, position);
    res.status(201).json({ success: true, message: 'User created successfully', user: result.user, token: result.token });
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
    const users = db.all('SELECT u.id, u.email, u.name, u.role, u.manager_id, u.department, u.position, u.created_at, m.name as manager_name FROM users u LEFT JOIN users m ON u.manager_id = m.id ORDER BY u.name');
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

// ============ Admin Routes ============

// Get admin stats
router.get('/admin/stats', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const db = require('../db/database');
    
    const totalEmployees = db.get('SELECT COUNT(*) as count FROM users WHERE role = ?', ['EMPLOYEE']);
    const totalManagers = db.get('SELECT COUNT(*) as count FROM users WHERE role = ?', ['MANAGER']);
    const activeGoals = db.get('SELECT COUNT(*) as count FROM employee_goals WHERE status = ?', ['ACTIVE']);
    const completedGoals = db.get('SELECT COUNT(*) as count FROM employee_goals WHERE status = ?', ['COMPLETED']);
    
    // Calculate completion rate
    const allGoals = db.all('SELECT * FROM employee_goals');
    const avgCompletion = allGoals.length > 0 
      ? Math.round(allGoals.reduce((sum, g) => sum + (g.latest_completion || 0), 0) / allGoals.length)
      : 0;
    
    // Get departments
    const departments = db.all('SELECT department, COUNT(*) as count FROM users WHERE department IS NOT NULL GROUP BY department');
    const topDepartment = departments.length > 0 ? departments[0].department : 'N/A';
    
    // Get employees needing attention (below 40%)
    const needsAttention = db.get('SELECT COUNT(DISTINCT employee_id) as count FROM employee_goals WHERE latest_completion < 40 AND status = ?', ['ACTIVE']);
    
    // Active period
    const activePeriod = db.get('SELECT name FROM rating_periods WHERE is_active = 1');
    
    res.json({
      totalEmployees: totalEmployees?.count || 0,
      totalManagers: totalManagers?.count || 0,
      activeGoals: activeGoals?.count || 0,
      completedGoals: completedGoals?.count || 0,
      completionRate: avgCompletion,
      topDepartment: topDepartment,
      needsAttention: needsAttention?.count || 0,
      activePeriod: activePeriod?.name || 'None'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all employees - accessible by ADMIN and MANAGER
router.get('/admin/employees', authenticate, requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const db = require('../db/database');
    const employees = db.all('SELECT id, email, name, role, manager_id, department, position FROM users WHERE role = ? ORDER BY name', ['EMPLOYEE']);
    res.json(employees);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user
router.put('/admin/users/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const db = require('../db/database');
    const { name, email, role, department, position, managerId } = req.body;
    
    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }
    
    // Validate role if provided
    if (role) {
      const validRoles = ['ADMIN', 'MANAGER', 'EMPLOYEE'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Must be ADMIN, MANAGER, or EMPLOYEE' });
      }
    }
    
    // Check if user exists
    const existingUser = db.get('SELECT id FROM users WHERE id = ?', [req.params.id]);
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    db.run(
      `UPDATE users SET name = ?, email = ?, role = ?, department = ?, position = ?, manager_id = ?, updated_at = ? WHERE id = ?`,
      [name, email, role, department || null, position || null, managerId || null, new Date().toISOString(), req.params.id]
    );
    
    res.json({ success: true, message: 'User updated successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete user
router.delete('/admin/users/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const db = require('../db/database');
    
    // Check if user exists
    const existingUser = db.get('SELECT id, role FROM users WHERE id = ?', [req.params.id]);
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Prevent admin from deleting themselves
    if (existingUser.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    // Delete related records first (order matters for foreign keys)
    db.run('DELETE FROM ai_feedback WHERE employee_id = ?', [req.params.id]);
    db.run('DELETE FROM goal_files WHERE employee_goal_id IN (SELECT id FROM employee_goals WHERE employee_id = ?)', [req.params.id]);
    db.run('DELETE FROM progress_updates WHERE employee_goal_id IN (SELECT id FROM employee_goals WHERE employee_id = ?)', [req.params.id]);
    db.run('DELETE FROM employee_goals WHERE employee_id = ?', [req.params.id]);
    db.run('DELETE FROM recommendations WHERE employee_id = ?', [req.params.id]);
    db.run('DELETE FROM empathy_adjustments WHERE employee_id = ?', [req.params.id]);
    db.run('DELETE FROM life_events WHERE employee_id = ?', [req.params.id]);
    db.run('DELETE FROM ratings WHERE employee_id = ?', [req.params.id]);
    db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
    
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Change user role (Admin only)
router.post('/admin/users/:id/change-role', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const db = require('../db/database');
    const { role } = req.body;
    
    // Validate role
    if (!role) {
      return res.status(400).json({ error: 'Role is required' });
    }
    
    const validRoles = ['ADMIN', 'MANAGER', 'EMPLOYEE'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be ADMIN, MANAGER, or EMPLOYEE' });
    }
    
    // Check if user exists
    const existingUser = db.get('SELECT id, name, email, role FROM users WHERE id = ?', [req.params.id]);
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Prevent admin from changing their own role
    if (existingUser.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }
    
    const previousRole = existingUser.role;
    db.run(
      `UPDATE users SET role = ?, updated_at = ? WHERE id = ?`,
      [role, new Date().toISOString(), req.params.id]
    );
    
    res.json({ 
      success: true, 
      message: `User role changed from ${previousRole} to ${role} successfully`,
      user: { ...existingUser, role }
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update goal
router.put('/admin/goals/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const db = require('../db/database');
    const { title, description, successCriteria, competencies } = req.body;
    
    // Validate required fields
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    // Check if goal exists
    const existingGoal = db.get('SELECT id FROM goals WHERE id = ?', [req.params.id]);
    if (!existingGoal) {
      return res.status(404).json({ error: 'Goal not found' });
    }
    
    db.run(
      `UPDATE goals SET title = ?, description = ?, success_criteria = ?, competencies = ?, updated_at = ? WHERE id = ?`,
      [title, description || null, successCriteria || null, competencies || null, new Date().toISOString(), req.params.id]
    );
    
    res.json({ success: true, message: 'Goal updated successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete goal
router.delete('/admin/goals/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const db = require('../db/database');
    
    // Check if goal exists
    const existingGoal = db.get('SELECT id FROM goals WHERE id = ?', [req.params.id]);
    if (!existingGoal) {
      return res.status(404).json({ error: 'Goal not found' });
    }
    
    // Delete related records
    db.run('DELETE FROM employee_goals WHERE goal_id = ?', [req.params.id]);
    db.run('DELETE FROM goals WHERE id = ?', [req.params.id]);
    
    res.json({ success: true, message: 'Goal deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update rating period
router.put('/rating-periods/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const db = require('../db/database');
    const { name, start_date, end_date, is_active } = req.body;
    
    // Validate required fields
    if (!name || !start_date || !end_date) {
      return res.status(400).json({ error: 'Name, start date, and end date are required' });
    }
    
    // Check if period exists
    const existingPeriod = db.get('SELECT id FROM rating_periods WHERE id = ?', [req.params.id]);
    if (!existingPeriod) {
      return res.status(404).json({ error: 'Rating period not found' });
    }
    
    // If setting as active, deactivate others
    if (is_active) {
      db.run('UPDATE rating_periods SET is_active = 0');
    }
    
    db.run(
      `UPDATE rating_periods SET name = ?, start_date = ?, end_date = ?, is_active = ? WHERE id = ?`,
      [name, start_date, end_date, is_active ? 1 : 0, req.params.id]
    );
    
    res.json({ success: true, message: 'Rating period updated successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete rating period
router.delete('/rating-periods/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const db = require('../db/database');
    
    // Check if period exists
    const existingPeriod = db.get('SELECT id FROM rating_periods WHERE id = ?', [req.params.id]);
    if (!existingPeriod) {
      return res.status(404).json({ error: 'Rating period not found' });
    }
    
    db.run('DELETE FROM rating_periods WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Rating period deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all groups
router.get('/admin/groups', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const db = require('../db/database');
    const groups = db.all('SELECT * FROM groups ORDER BY name');
    
    // Get goals for each group
    const result = groups.map(g => {
      const goals = db.all(
        `SELECT gg.goal_id, g.title, g.description FROM group_goals gg JOIN goals g ON gg.goal_id = g.id WHERE gg.group_id = ?`,
        [g.id]
      );
      return { ...g, goals };
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single group
router.get('/admin/groups/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const db = require('../db/database');
    const group = db.get('SELECT * FROM groups WHERE id = ?', [req.params.id]);
    
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    const goals = db.all(
      `SELECT gg.goal_id, g.title, g.description FROM group_goals gg JOIN goals g ON gg.goal_id = g.id WHERE gg.group_id = ?`,
      [req.params.id]
    );
    
    res.json({ ...group, goals });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create group
router.post('/admin/groups', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const db = require('../db/database');
    const { name, description } = req.body;
    const id = require('uuid').v4();
    
    db.run(
      `INSERT INTO groups (id, name, description, created_at) VALUES (?, ?, ?, ?)`,
      [id, name, description || null, new Date().toISOString()]
    );
    
    res.json({ id, name, description });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update group
router.put('/admin/groups/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const db = require('../db/database');
    const { name, description } = req.body;
    
    db.run(
      `UPDATE groups SET name = ?, description = ? WHERE id = ?`,
      [name, description || null, req.params.id]
    );
    
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete group
router.delete('/admin/groups/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const db = require('../db/database');
    db.run('DELETE FROM group_goals WHERE group_id = ?', [req.params.id]);
    db.run('DELETE FROM groups WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Map goals to group
router.post('/admin/groups/:id/goals', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const db = require('../db/database');
    const { goal_ids } = req.body;
    
    // Remove existing mappings
    db.run('DELETE FROM group_goals WHERE group_id = ?', [req.params.id]);
    
    // Add new mappings
    if (goal_ids && goal_ids.length > 0) {
      goal_ids.forEach(goalId => {
        db.run('INSERT INTO group_goals (group_id, goal_id) VALUES (?, ?)', [req.params.id, goalId]);
      });
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all goals (Admin and Manager)
router.get('/admin/goals', authenticate, requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const GoalService = require('../services/goalService');
    const goals = GoalService.getAllGoals();
    res.json(goals);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all managers (for assignment) - accessible by ADMIN and MANAGER
router.get('/admin/managers', authenticate, requireRole('ADMIN', 'MANAGER'), async (req, res) => {
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
    const db = require('../db/database');
    const GoalService = require('../services/goalService');
    const { employeeId, goalId, customizedTitle, customizedCriteria } = req.body;
    
    // Validate manager-employee relationship
    if (!validateManagerEmployee(req.user.id, employeeId, db)) {
      return res.status(403).json({ error: "You don't have permission to perform this action on this employee" });
    }
    
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

// Get manager stats
router.get('/manager/stats', authenticate, requireRole('MANAGER'), async (req, res) => {
  try {
    const db = require('../db/database');
    const AuthService = require('../services/authService');
    
    const team = AuthService.getTeamMembers(req.user.id);
    const teamGoals = db.all(
      `SELECT eg.* FROM employee_goals eg 
       JOIN users u ON eg.employee_id = u.id 
       WHERE u.manager_id = ? AND eg.status = 'ACTIVE'`,
      [req.user.id]
    );
    
    const completedGoals = teamGoals.filter(g => g.status === 'COMPLETED').length;
    const onTrack = teamGoals.filter(g => (g.latest_completion || 0) >= 70).length;
    const needsImprovement = teamGoals.filter(g => (g.latest_completion || 0) < 40).length;
    
    const avgCompletion = teamGoals.length > 0
      ? Math.round(teamGoals.reduce((sum, g) => sum + (g.latest_completion || 0), 0) / teamGoals.length)
      : 0;
    
    // Pending approvals (life events)
    const pendingApprovals = db.get(
      'SELECT COUNT(*) as count FROM life_events WHERE status = ?',
      ['PENDING']
    );
    
    res.json({
      teamMembers: team.length,
      activeGoals: teamGoals.length,
      completedGoals: completedGoals,
      completedThisPeriod: completedGoals,
      completionRate: avgCompletion,
      onTrack: onTrack,
      needsImprovement: needsImprovement,
      pendingApprovals: pendingApprovals?.count || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get manager's personal goals (as an employee)
router.get('/manager/my-goals', authenticate, requireRole('MANAGER'), async (req, res) => {
  try {
    const GoalService = require('../services/goalService');
    const goals = GoalService.getEmployeeGoals(req.user.id);
    res.json(goals);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get manager's personal ratings (as an employee)
router.get('/manager/my-ratings', authenticate, requireRole('MANAGER'), async (req, res) => {
  try {
    const db = require('../db/database');
    const ratings = db.all(
      `SELECT r.*, rp.name as period_name, rp.start_date, rp.end_date
       FROM ratings r
       LEFT JOIN rating_periods rp ON r.rating_period = rp.id
       WHERE r.employee_id = ?
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    res.json(ratings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get custom goals for team
router.get('/manager/custom-goals', authenticate, requireRole('MANAGER'), async (req, res) => {
  try {
    const db = require('../db/database');
    const customGoals = db.all('SELECT * FROM custom_goals WHERE manager_id = ?', [req.user.id]);
    res.json(customGoals);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create custom goal
router.post('/manager/custom-goals', authenticate, requireRole('MANAGER'), async (req, res) => {
  try {
    const db = require('../db/database');
    const { title, description } = req.body;
    const id = require('uuid').v4();
    
    db.run(
      `INSERT INTO custom_goals (id, manager_id, title, description, created_at) VALUES (?, ?, ?, ?, ?)`,
      [id, req.user.id, title, description || null, new Date().toISOString()]
    );
    
    res.json({ id, title, description });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete custom goal
router.delete('/manager/custom-goals/:id', authenticate, requireRole('MANAGER'), async (req, res) => {
  try {
    const db = require('../db/database');
    db.run('DELETE FROM custom_goals WHERE id = ? AND manager_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Unassign team member (remove from manager's team)
router.post('/manager/team/:id/unassign', authenticate, requireRole('MANAGER'), async (req, res) => {
  try {
    const db = require('../db/database');

    // Verify employee is on this manager's team
    const employee = db.get('SELECT id, manager_id FROM users WHERE id = ? AND manager_id = ?', [req.params.id, req.user.id]);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found on your team' });
    }

    db.run('UPDATE users SET manager_id = NULL WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Team member removed from your team' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get pending life events for manager approval
router.get('/manager/pending-life-events', authenticate, requireRole('MANAGER'), async (req, res) => {
  try {
    const db = require('../db/database');
    const events = db.all(
      `SELECT le.*, u.name as employee_name 
       FROM life_events le 
       JOIN users u ON le.employee_id = u.id 
       WHERE u.manager_id = ? AND le.status = 'PENDING'
       ORDER BY le.created_at DESC`,
      [req.user.id]
    );
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Approve life event
router.post('/manager/life-events/:id/approve', authenticate, requireRole('MANAGER'), async (req, res) => {
  try {
    const db = require('../db/database');
    
    // Get the life event to calculate adjustment
    const event = db.get('SELECT * FROM life_events WHERE id = ?', [req.params.id]);
    
    if (!event) {
      return res.status(404).json({ error: 'Life event not found' });
    }
    
    // Validate manager-employee relationship
    if (!validateManagerEmployee(req.user.id, event.employee_id, db)) {
      return res.status(403).json({ error: "You don't have permission to perform this action on this employee" });
    }
    
    if (event.status !== 'PENDING') {
      return res.status(400).json({ error: 'This life event has already been processed' });
    }
    
    // Calculate adjustment based on duration
    const start = new Date(event.start_date);
    const end = new Date(event.end_date);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    
    // Calculate adjustment percentage (more days = higher adjustment)
    let adjustmentPercentage = 0;
    if (days >= 30) adjustmentPercentage = 15;
    else if (days >= 14) adjustmentPercentage = 10;
    else if (days >= 7) adjustmentPercentage = 5;
    
    db.run(
      `UPDATE life_events SET status = ?, adjustment_percentage = ?, verified_by = ?, updated_at = ? WHERE id = ?`,
      ['APPROVED', adjustmentPercentage, req.user.id, new Date().toISOString(), req.params.id]
    );
    
    res.json({ success: true, message: `Life event approved with ${adjustmentPercentage}% adjustment`, adjustmentPercentage });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Reject life event
router.post('/manager/life-events/:id/reject', authenticate, requireRole('MANAGER'), async (req, res) => {
  try {
    const db = require('../db/database');
    const { reason } = req.body;
    
    // Get the life event
    const event = db.get('SELECT * FROM life_events WHERE id = ?', [req.params.id]);
    
    if (!event) {
      return res.status(404).json({ error: 'Life event not found' });
    }
    
    // Validate manager-employee relationship
    if (!validateManagerEmployee(req.user.id, event.employee_id, db)) {
      return res.status(403).json({ error: "You don't have permission to perform this action on this employee" });
    }
    
    if (event.status !== 'PENDING') {
      return res.status(400).json({ error: 'This life event has already been processed' });
    }
    
    db.run(
      `UPDATE life_events SET status = ?, rejection_reason = ?, verified_by = ?, updated_at = ? WHERE id = ?`,
      ['REJECTED', reason || null, req.user.id, new Date().toISOString(), req.params.id]
    );
    
    res.json({ success: true, message: 'Life event rejected' });
  } catch (error) {
    res.status(400).json({ error: error.message });
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
    const db = require('../db/database');
    const EmpathyService = require('../services/empathyService');
    const { raw_score, rating_period } = req.body;
    
    // Validate manager-employee relationship
    if (!validateManagerEmployee(req.user.id, req.params.employeeId, db)) {
      return res.status(403).json({ error: "You don't have permission to perform this action on this employee" });
    }
    
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
    
    // Validate manager-employee relationship
    if (!validateManagerEmployee(req.user.id, req.params.employeeId, db)) {
      return res.status(403).json({ error: "You don't have permission to perform this action on this employee" });
    }
    
    const recs = db.all(
      `SELECT * FROM recommendations WHERE employee_id = ? ORDER BY priority DESC`,
      [req.params.employeeId]
    );
    res.json(recs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get pending weightage changes for manager's team
router.get('/manager/pending-weightage-changes', authenticate, requireRole('MANAGER'), async (req, res) => {
  try {
    const db = require('../db/database');
    const changes = db.all(
      `SELECT eg.*, u.name as employee_name, g.title as goal_title, eg.customized_title as goal_customized_title
       FROM employee_goals eg
       JOIN users u ON eg.employee_id = u.id
       LEFT JOIN goals g ON eg.goal_id = g.id
       WHERE u.manager_id = ? AND eg.weightage_pending_approval = 1
       ORDER BY eg.assigned_at DESC`,
      [req.user.id]
    );
    res.json(changes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Approve weightage change
router.post('/manager/goal-weightage/:id/approve', authenticate, requireRole('MANAGER'), async (req, res) => {
  try {
    const db = require('../db/database');
    const { weightage } = req.body;
    
    // Get the employee goal
    const employeeGoal = db.get(
      `SELECT eg.*, u.manager_id FROM employee_goals eg
       JOIN users u ON eg.employee_id = u.id
       WHERE eg.id = ?`,
      [req.params.id]
    );
    
    if (!employeeGoal) {
      return res.status(404).json({ error: 'Employee goal not found' });
    }
    
    // Validate manager-employee relationship
    if (employeeGoal.manager_id !== req.user.id) {
      return res.status(403).json({ error: "You don't have permission to perform this action on this employee" });
    }
    
    if (!employeeGoal.weightage_pending_approval) {
      return res.status(400).json({ error: 'This weightage change is not pending approval' });
    }
    
    // Update weightage and clear pending flag
    db.run(
      `UPDATE employee_goals SET weightage = ?, weightage_pending_approval = 0, updated_at = ? WHERE id = ?`,
      [weightage || employeeGoal.weightage, new Date().toISOString(), req.params.id]
    );
    
    res.json({ success: true, message: 'Weightage change approved', weightage: weightage || employeeGoal.weightage });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Reject weightage change
router.post('/manager/goal-weightage/:id/reject', authenticate, requireRole('MANAGER'), async (req, res) => {
  try {
    const db = require('../db/database');
    
    // Get the employee goal
    const employeeGoal = db.get(
      `SELECT eg.*, u.manager_id FROM employee_goals eg
       JOIN users u ON eg.employee_id = u.id
       WHERE eg.id = ?`,
      [req.params.id]
    );
    
    if (!employeeGoal) {
      return res.status(404).json({ error: 'Employee goal not found' });
    }
    
    // Validate manager-employee relationship
    if (employeeGoal.manager_id !== req.user.id) {
      return res.status(403).json({ error: "You don't have permission to perform this action on this employee" });
    }
    
    if (!employeeGoal.weightage_pending_approval) {
      return res.status(400).json({ error: 'This weightage change is not pending approval' });
    }
    
    // Clear pending flag without changing weightage
    db.run(
      `UPDATE employee_goals SET weightage_pending_approval = 0, updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), req.params.id]
    );
    
    res.json({ success: true, message: 'Weightage change rejected' });
  } catch (error) {
    res.status(400).json({ error: error.message });
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
       LEFT JOIN goals g ON f.goal_id = g.id
       WHERE f.employee_id = ?
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

// Get employee stats
router.get('/employee/stats', authenticate, async (req, res) => {
  try {
    const db = require('../db/database');
    
    const goals = db.all('SELECT * FROM employee_goals WHERE employee_id = ?', [req.user.id]);
    const activeGoals = goals.filter(g => g.status === 'ACTIVE');
    const completedGoals = goals.filter(g => g.status === 'COMPLETED');
    
    const avgCompletion = activeGoals.length > 0
      ? Math.round(activeGoals.reduce((sum, g) => sum + (g.latest_completion || 0), 0) / activeGoals.length)
      : 0;
    
    const needsAttention = activeGoals.filter(g => (g.latest_completion || 0) < 40);
    const goingWell = activeGoals.filter(g => (g.latest_completion || 0) >= 70);
    
    // Find focus priority based on weightage
    let focusPriority = 'N/A';
    if (activeGoals.length > 0) {
      const sorted = [...activeGoals].sort((a, b) => (b.weightage || 0) - (a.weightage || 0));
      focusPriority = sorted[0]?.customized_title || sorted[0]?.goal_title || 'N/A';
    }
    
    // Last rating
    const lastRating = db.get('SELECT * FROM ratings WHERE employee_id = ? ORDER BY created_at DESC LIMIT 1', [req.user.id]);
    
    // Pending approvals
    const pendingWeightage = db.get(
      'SELECT COUNT(*) as count FROM employee_goals WHERE employee_id = ? AND weightage_pending_approval = 1',
      [req.user.id]
    );
    
    res.json({
      activeGoals: activeGoals.length,
      completedGoals: completedGoals.length,
      avgCompletion: avgCompletion,
      needsAttention: needsAttention.length,
      goingWell: goingWell.length,
      focusPriority: focusPriority,
      lastRating: lastRating ? Math.round(lastRating.final_score * 100) + '%' : 'N/A',
      pendingApprovals: pendingWeightage?.count || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get employee life events
router.get('/employee/life-events', authenticate, async (req, res) => {
  try {
    const db = require('../db/database');
    const events = db.all('SELECT * FROM life_events WHERE employee_id = ? ORDER BY created_at DESC', [req.user.id]);
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add life event
router.post('/employee/life-events', authenticate, async (req, res) => {
  try {
    const db = require('../db/database');
    const { event_type, start_date, end_date, reason } = req.body;
    
    // Validate required fields
    if (!event_type || !start_date || !end_date) {
      return res.status(400).json({ error: 'Event type, start date, and end date are required' });
    }
    
    // Validate event type
    const validTypes = ['SICK_LEAVE', 'MATERNITY_LEAVE', 'PATERNITY_LEAVE', 'BEREAVEMENT', 'SABBATICAL', 'FAMILY_EMERGENCY', 'PERSONAL_EMERGENCY', 'OTHER'];
    if (!validTypes.includes(event_type)) {
      return res.status(400).json({ error: 'Invalid event type' });
    }
    
    // Validate date range
    if (new Date(start_date) > new Date(end_date)) {
      return res.status(400).json({ error: 'Start date must be before end date' });
    }
    
    const id = require('uuid').v4();
    
    db.run(
      `INSERT INTO life_events (id, employee_id, event_type, start_date, end_date, reason, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
      [id, req.user.id, event_type, start_date, end_date, reason || null, new Date().toISOString()]
    );
    
    res.status(201).json({ success: true, message: 'Life event submitted successfully', id, event_type, start_date, end_date, reason, status: 'PENDING' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update life event
router.put('/employee/life-events/:id', authenticate, async (req, res) => {
  try {
    const db = require('../db/database');
    const { event_type, start_date, end_date, reason } = req.body;
    
    // Validate required fields
    if (!event_type || !start_date || !end_date) {
      return res.status(400).json({ error: 'Event type, start date, and end date are required' });
    }
    
    // Only allow updating if still pending
    const event = db.get('SELECT status FROM life_events WHERE id = ? AND employee_id = ?', [req.params.id, req.user.id]);
    
    if (!event) {
      return res.status(404).json({ error: 'Life event not found' });
    }
    
    if (event.status !== 'PENDING') {
      return res.status(400).json({ error: 'Cannot update approved/rejected life events' });
    }
    
    // Validate date range
    if (new Date(start_date) > new Date(end_date)) {
      return res.status(400).json({ error: 'Start date must be before end date' });
    }
    
    db.run(
      `UPDATE life_events SET event_type = ?, start_date = ?, end_date = ?, reason = ?, updated_at = ? WHERE id = ?`,
      [event_type, start_date, end_date, reason || null, new Date().toISOString(), req.params.id]
    );
    
    res.json({ success: true, message: 'Life event updated successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete life event
router.delete('/employee/life-events/:id', authenticate, async (req, res) => {
  try {
    const db = require('../db/database');
    
    // Only allow deleting if pending
    const event = db.get('SELECT status FROM life_events WHERE id = ? AND employee_id = ?', [req.params.id, req.user.id]);
    
    if (!event) {
      return res.status(404).json({ error: 'Life event not found' });
    }
    
    if (event.status !== 'PENDING') {
      return res.status(400).json({ error: 'Cannot delete approved/rejected life events' });
    }
    
    db.run('DELETE FROM life_events WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Life event deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update goal weightage
router.put('/employee/goals/:id/weightage', authenticate, async (req, res) => {
  try {
    const db = require('../db/database');
    const { weightage } = req.body;
    
    // Validate weightage
    if (weightage === undefined || weightage === null) {
      return res.status(400).json({ error: 'Weightage is required' });
    }
    
    const weightageNum = parseInt(weightage);
    if (isNaN(weightageNum) || weightageNum < 0 || weightageNum > 100) {
      return res.status(400).json({ error: 'Weightage must be a number between 0 and 100' });
    }
    
    // Check if goal exists and belongs to employee
    const goal = db.get('SELECT id, employee_id FROM employee_goals WHERE id = ?', [req.params.id]);
    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }
    
    if (goal.employee_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only update weightage for your own goals' });
    }
    
    db.run(
      `UPDATE employee_goals SET weightage = ?, weightage_pending_approval = 1 WHERE id = ? AND employee_id = ?`,
      [weightageNum, req.params.id, req.user.id]
    );
    
    res.json({ success: true, message: 'Weightage updated successfully and sent for manager approval' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Upload file for goal
router.post('/employee/goals/:id/files', authenticate, async (req, res) => {
  try {
    const db = require('../db/database');
    const id = require('uuid').v4();

    // Handle both JSON body and form data
    let file_name, description;
    if (req.body.file_name) {
      // JSON body
      file_name = req.body.file_name;
      description = req.body.description;
    } else {
      // Form data - file info comes from the upload
      file_name = req.body.description ? `file_${Date.now()}` : `upload_${Date.now()}`;
      description = req.body.description || null;
    }

    // Verify goal belongs to user
    const goal = db.get('SELECT id, employee_id FROM employee_goals WHERE id = ?', [req.params.id]);
    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }
    if (goal.employee_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only upload files for your own goals' });
    }

    db.run(
      `INSERT INTO goal_files (id, employee_goal_id, file_name, file_path, description, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, req.params.id, file_name, null, description || null, new Date().toISOString()]
    );

    res.json({ success: true, id, file_name });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get goal files
router.get('/employee/goals/:id/files', authenticate, async (req, res) => {
  try {
    const db = require('../db/database');
    const files = db.all(
      'SELECT * FROM goal_files WHERE employee_goal_id = ? ORDER BY uploaded_at DESC',
      [req.params.id]
    );
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ Reports Route ============

// Get team report with filters
router.get('/reports/team', authenticate, requireRole('MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const db = require('../db/database');
    const { managerId, employeeId, periodId } = req.query;
    
    let whereClause = 'WHERE 1=1';
    const params = [];
    
    if (employeeId) {
      whereClause += ' AND u.id = ?';
      params.push(employeeId);
    }
    
    if (managerId) {
      whereClause += ' AND u.manager_id = ?';
      params.push(managerId);
    }
    
    // Get summary stats
    const employeeCount = db.get(`SELECT COUNT(DISTINCT u.id) as count FROM users u ${whereClause} AND u.role = 'EMPLOYEE'`, params);
    const managerCount = db.get(`SELECT COUNT(DISTINCT u.manager_id) as count FROM users u ${whereClause} AND u.role = 'EMPLOYEE' AND u.manager_id IS NOT NULL`, params);
    
    // Get all goals for the filtered employees
    const goals = db.all(
      `SELECT eg.*, u.name as employee_name, u.manager_id, m.name as manager_name 
       FROM employee_goals eg 
       JOIN users u ON eg.employee_id = u.id 
       LEFT JOIN users m ON u.manager_id = m.id 
       ${whereClause} AND u.role = 'EMPLOYEE'`,
      params
    );
    
    const avgCompletion = goals.length > 0
      ? Math.round(goals.reduce((sum, g) => sum + (g.latest_completion || 0), 0) / goals.length)
      : 0;
    
    // Group by manager
    const byManager = {};
    goals.forEach(g => {
      if (g.manager_id) {
        if (!byManager[g.manager_id]) {
          byManager[g.manager_id] = { id: g.manager_id, name: g.manager_name, employees: [], employeeCount: 0, totalCompletion: 0 };
        }
        byManager[g.manager_id].employees.push({ id: g.employee_id, name: g.employee_name, completion: g.latest_completion || 0 });
        byManager[g.manager_id].totalCompletion += g.latest_completion || 0;
        byManager[g.manager_id].employeeCount++;
      }
    });
    
    const managerData = Object.values(byManager).map(m => ({
      ...m,
      avgCompletion: m.employeeCount > 0 ? Math.round(m.totalCompletion / m.employeeCount) : 0
    }));
    
    res.json({
      summary: {
        employeeCount: employeeCount?.count || 0,
        managerCount: managerCount?.count || 0,
        avgCompletion: avgCompletion
      },
      byManager: managerData
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
router.post('/rating-periods', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const db = require('../db/database');
    const { name, start_date, end_date, is_active } = req.body;
    
    // Validate required fields
    if (!name || !start_date || !end_date) {
      return res.status(400).json({ error: 'Name, start date, and end date are required' });
    }
    
    // Validate date format (basic check)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(start_date) || !dateRegex.test(end_date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }
    
    // Validate date range
    if (new Date(start_date) > new Date(end_date)) {
      return res.status(400).json({ error: 'Start date must be before end date' });
    }
    
    const id = require('uuid').v4();
    
    // If setting as active, deactivate others
    if (is_active) {
      db.run('UPDATE rating_periods SET is_active = 0');
    }
    
    db.run(
      `INSERT INTO rating_periods (id, name, start_date, end_date, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, name, start_date, end_date, is_active ? 1 : 0, new Date().toISOString()]
    );
    
    res.status(201).json({ success: true, message: 'Rating period created successfully', id, name, start_date, end_date, is_active });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;