/**
 * Goal Service
 * Handles goal creation, assignment, and management
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');

class GoalService {
  /**
   * Create a new company goal (Admin only)
   */
  static createGoal(title, description, successCriteria, competencies, contextForAI, createdBy) {
    const goalId = uuidv4();
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO goals (id, title, description, success_criteria, competencies, context_for_ai, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [goalId, title, description || '', successCriteria || '', competencies || '', contextForAI || '', createdBy, now, now]
    );

    // Log audit
    this.logAudit('GOAL', goalId, 'CREATE', createdBy, { title, description });

    return {
      id: goalId,
      title,
      description,
      success_criteria: successCriteria,
      competencies,
      context_for_ai: contextForAI,
      created_at: now
    };
  }

  /**
   * Get all company goals
   */
  static getAllGoals() {
    return db.all(
      `SELECT g.*, u.name as created_by_name 
       FROM goals g 
       LEFT JOIN users u ON g.created_by = u.id 
       ORDER BY g.created_at DESC`
    );
  }

  /**
   * Get goal by ID
   */
  static getGoalById(goalId) {
    return db.get(
      `SELECT g.*, u.name as created_by_name 
       FROM goals g 
       LEFT JOIN users u ON g.created_by = u.id 
       WHERE g.id = ?`,
      [goalId]
    );
  }

  /**
   * Update a goal
   */
  static updateGoal(goalId, updates, updatedBy) {
    const allowedFields = ['title', 'description', 'success_criteria', 'competencies', 'context_for_ai'];
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

    setClause.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(goalId);

    db.run(`UPDATE goals SET ${setClause.join(', ')} WHERE id = ?`, values);

    this.logAudit('GOAL', goalId, 'UPDATE', updatedBy, updates);

    return this.getGoalById(goalId);
  }

  /**
   * Assign a goal to an employee (Manager/Admin)
   */
  static assignGoal(employeeId, goalId, customizedTitle, customizedCriteria, assignedBy) {
    // Check if already assigned
    const existing = db.get(
      `SELECT id FROM employee_goals WHERE employee_id = ? AND goal_id = ?`,
      [employeeId, goalId]
    );

    if (existing) {
      throw new Error('Goal already assigned to this employee');
    }

    const egId = uuidv4();
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO employee_goals (id, employee_id, goal_id, customized_title, customized_criteria, assigned_by, assigned_at, status, latest_completion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [egId, employeeId, goalId, customizedTitle || null, customizedCriteria || null, assignedBy, now, 'ACTIVE']
    );

    this.logAudit('EMPLOYEE_GOAL', egId, 'ASSIGN', assignedBy, {
      employee_id: employeeId,
      goal_id: goalId
    });

    return {
      id: egId,
      employee_id: employeeId,
      goal_id: goalId,
      customized_title: customizedTitle,
      customized_criteria: customizedCriteria,
      assigned_at: now,
      status: 'ACTIVE'
    };
  }

  /**
   * Get employee's assigned goals
   */
  static getEmployeeGoals(employeeId) {
    const goals = db.all(
      `SELECT eg.*, g.title, g.description, g.success_criteria, g.competencies, g.context_for_ai,
              (SELECT completion_percentage FROM progress_updates WHERE employee_goal_id = eg.id ORDER BY created_at DESC LIMIT 1) as latest_completion
       FROM employee_goals eg
       JOIN goals g ON eg.goal_id = g.id
       WHERE eg.employee_id = ? AND eg.status = 'ACTIVE'
       ORDER BY 
         CASE WHEN (SELECT completion_percentage FROM progress_updates WHERE employee_goal_id = eg.id ORDER BY created_at DESC LIMIT 1) < 40 THEN 1
              WHEN (SELECT completion_percentage FROM progress_updates WHERE employee_goal_id = eg.id ORDER BY created_at DESC LIMIT 1) >= 100 THEN 3
              ELSE 2 END,
         latest_completion DESC`,
      [employeeId]
    );
    
    // Get files for each goal
    goals.forEach(goal => {
      goal.files = db.all(
        'SELECT * FROM goal_files WHERE employee_goal_id = ? ORDER BY uploaded_at DESC',
        [goal.id]
      );
    });
    
    return goals;
  }

  /**
   * Get employees with a specific goal assigned
   */
  static getGoalAssignments(goalId) {
    return db.all(
      `SELECT eg.*, u.name as employee_name, u.email as employee_email, u.department, u.position
       FROM employee_goals eg
       JOIN users u ON eg.employee_id = u.id
       WHERE eg.goal_id = ? AND eg.status = 'ACTIVE'`,
      [goalId]
    );
  }

  /**
   * Submit progress update for a goal
   */
  static submitProgress(employeeGoalId, completionPercentage, updateText, evidence, timePeriod) {
    const progressId = uuidv4();
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO progress_updates (id, employee_goal_id, completion_percentage, update_text, evidence, time_period, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [progressId, employeeGoalId, completionPercentage, updateText || '', evidence || '', timePeriod || 'Weekly', now]
    );

    // Update latest_completion in employee_goals table
    db.run(
      `UPDATE employee_goals SET latest_completion = ? WHERE id = ?`,
      [completionPercentage, employeeGoalId]
    );

    // Get employee goal details for AI feedback
    const employeeGoal = db.get(
      `SELECT eg.*, u.name as employee_name, u.position, u.department, u.id as employee_id, g.title, g.description, g.success_criteria
       FROM employee_goals eg
       JOIN users u ON eg.employee_id = u.id
       JOIN goals g ON eg.goal_id = g.id
       WHERE eg.id = ?`,
      [employeeGoalId]
    );

    // Trigger AI feedback generation (async)
    if (employeeGoal) {
      const AIService = require('./aiService');
      AIService.generateGoalFeedback(
        { id: employeeGoal.employee_id, name: employeeGoal.employee_name, position: employeeGoal.position, department: employeeGoal.department },
        { id: employeeGoal.goal_id, title: employeeGoal.customized_title || employeeGoal.title, success_criteria: employeeGoal.customized_criteria || employeeGoal.success_criteria },
        { completion_percentage: completionPercentage, update_text: updateText, time_period: timePeriod }
      ).catch(err => console.error('AI feedback error:', err));
    }

    return {
      id: progressId,
      employee_goal_id: employeeGoalId,
      completion_percentage: completionPercentage,
      update_text: updateText,
      time_period: timePeriod,
      created_at: now
    };
  }

  /**
   * Get progress history for an employee goal
   */
  static getProgressHistory(employeeGoalId) {
    return db.all(
      `SELECT * FROM progress_updates WHERE employee_goal_id = ? ORDER BY created_at DESC`,
      [employeeGoalId]
    );
  }

  /**
   * Get all employee goals for a manager's team
   */
  static getTeamGoals(managerId) {
    return db.all(
      `SELECT eg.*, u.name as employee_name, u.email, u.department, u.position, 
              g.title as goal_title, g.description as goal_description
       FROM employee_goals eg
       JOIN users u ON eg.employee_id = u.id
       JOIN goals g ON eg.goal_id = g.id
       WHERE u.manager_id = ? AND eg.status = 'ACTIVE'
       ORDER BY u.name, eg.assigned_at`,
      [managerId]
    );
  }

  /**
   * Log audit entry
   */
  static logAudit(entityType, entityId, action, actorId, changes) {
    const id = uuidv4();
    db.run(
      `INSERT INTO audit_logs (id, entity_type, entity_id, action, actor_id, changes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, entityType, entityId, action, actorId, JSON.stringify(changes), new Date().toISOString()]
    );
  }
}

module.exports = GoalService;