/**
 * Seed Database with Demo Data
 * Creates sample users, goals, assignments, progress, feedback, and ratings
 */

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');

async function seedDatabase() {
  // Initialize database first
  await db.init();
  console.log('Seeding database with demo data...');
  
  const now = new Date().toISOString();
  
  // 1. Create Managers
  const managers = [
    { id: uuidv4(), name: 'Sarah Johnson', email: 'sarah.johnson@company.com', department: 'Engineering', position: 'Engineering Manager' },
    { id: uuidv4(), name: 'Mike Chen', email: 'mike.chen@company.com', department: 'Product', position: 'Product Manager' },
    { id: uuidv4(), name: 'Emily Davis', email: 'emily.davis@company.com', department: 'Design', position: 'Design Lead' }
  ];
  
  const managerPassword = bcrypt.hashSync('password123', 10);
  
  for (const m of managers) {
    db.run(
      `INSERT OR IGNORE INTO users (id, email, password, name, role, department, position) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [m.id, m.email, managerPassword, m.name, 'MANAGER', m.department, m.position]
    );
  }
  console.log('Created 3 managers');
  
  // 2. Create Employees
  const employees = [
    { id: uuidv4(), name: 'John Smith', email: 'john.smith@company.com', department: 'Engineering', position: 'Senior Developer', managerId: managers[0].id },
    { id: uuidv4(), name: 'Lisa Wang', email: 'lisa.wang@company.com', department: 'Engineering', position: 'Junior Developer', managerId: managers[0].id },
    { id: uuidv4(), name: 'Robert Brown', email: 'robert.brown@company.com', department: 'Engineering', position: 'Developer', managerId: managers[0].id },
    { id: uuidv4(), name: 'Alice Kim', email: 'alice.kim@company.com', department: 'Product', position: 'Product Analyst', managerId: managers[1].id },
    { id: uuidv4(), name: 'David Lee', email: 'david.lee@company.com', department: 'Product', position: 'Associate PM', managerId: managers[1].id },
    { id: uuidv4(), name: 'Emma Wilson', email: 'emma.wilson@company.com', department: 'Design', position: 'UI Designer', managerId: managers[2].id },
    { id: uuidv4(), name: 'James Taylor', email: 'james.taylor@company.com', department: 'Design', position: 'UX Designer', managerId: managers[2].id },
    { id: uuidv4(), name: 'Sophie Martinez', email: 'sophie.martinez@company.com', department: 'Engineering', position: 'DevOps Engineer', managerId: managers[0].id }
  ];
  
  const employeePassword = bcrypt.hashSync('password123', 10);
  
  for (const e of employees) {
    db.run(
      `INSERT OR IGNORE INTO users (id, email, password, name, role, department, position, manager_id, years_in_role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [e.id, e.email, employeePassword, e.name, 'EMPLOYEE', e.department, e.position, e.managerId, Math.floor(Math.random() * 5) + 1]
    );
  }
  console.log('Created 8 employees');
  
  // 3. Create Goals
  const goals = [
    { 
      id: uuidv4(),
      title: 'Complete Q1 Project Deliverables',
      description: 'Deliver all assigned project features on time with high quality',
      success_criteria: '100% of sprint stories completed, < 5% bug rate, code review feedback addressed within 24 hours',
      competencies: 'Technical Skills, Time Management, Communication',
      context_for_ai: 'Excellence means delivering features on schedule while maintaining code quality and collaborating effectively with the team'
    },
    { 
      id: uuidv4(),
      title: 'Improve Code Quality',
      description: 'Enhance code maintainability and reduce technical debt',
      success_criteria: 'Reduce code complexity by 20%, increase test coverage to 80%, document all new APIs',
      competencies: 'Technical Excellence, Documentation',
      context_for_ai: 'Focus on writing clean, maintainable code with comprehensive tests and documentation'
    },
    { 
      id: uuidv4(),
      title: 'Team Collaboration',
      description: 'Contribute to team knowledge sharing and mentorship',
      success_criteria: 'Conduct 2 tech talks/month, mentor 1 junior developer, participate in all team ceremonies',
      competencies: 'Collaboration, Leadership, Mentorship',
      context_for_ai: 'Excellence means being an active team player who helps others grow and shares knowledge proactively'
    },
    { 
      id: uuidv4(),
      title: 'Product Delivery Excellence',
      description: 'Successfully deliver product features that meet user needs',
      success_criteria: 'Ship 3 major features, achieve 90% user satisfaction score, zero critical bugs in production',
      competencies: 'Product Thinking, User Focus, Delivery',
      context_for_ai: 'Focus on delivering value to users through well-designed, functional features'
    },
    { 
      id: uuidv4(),
      title: 'Design System Implementation',
      description: 'Create and maintain consistent design patterns across products',
      success_criteria: 'Complete design system documentation, 100% component coverage, zero design inconsistencies',
      competencies: 'Design Systems, Attention to Detail, Communication',
      context_for_ai: 'Excellence means creating scalable, consistent designs that the whole team can use'
    },
    { 
      id: uuidv4(),
      title: 'Professional Development',
      description: 'Grow skills through learning and certification',
      success_criteria: 'Complete 2 relevant courses, obtain 1 certification, apply 1 new skill to work',
      competencies: 'Learning Agility, Growth Mindset',
      context_for_ai: 'Focus on continuous improvement and staying current with industry trends'
    }
  ];
  
  for (const g of goals) {
    const admin = db.get("SELECT id FROM users WHERE role = 'ADMIN'");
    if (admin) {
      db.run(
        `INSERT OR IGNORE INTO goals (id, title, description, success_criteria, competencies, context_for_ai, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [g.id, g.title, g.description, g.success_criteria, g.competencies, g.context_for_ai, admin.id, now]
      );
    }
  }
  console.log('Created 6 company goals');
  
  // 4. Assign goals to employees
  const goalAssignments = [
    // Engineering team
    { employeeId: employees[0].id, goalId: goals[0].id, customTitle: 'Lead Q1 Backend Migration', customCriteria: 'Complete migration of 5 microservices to new architecture' },
    { employeeId: employees[0].id, goalId: goals[2].id, customTitle: 'Mentor Junior Developers', customCriteria: 'Weekly 1:1s with 2 junior devs, conduct 3 code reviews' },
    { employeeId: employees[1].id, goalId: goals[0].id, customTitle: 'Complete Feature Development', customCriteria: 'Complete 15 user stories this quarter' },
    { employeeId: employees[1].id, goalId: goals[1].id, customTitle: 'Improve Test Coverage', customCriteria: 'Increase unit test coverage from 50% to 75%' },
    { employeeId: employees[2].id, goalId: goals[0].id, customTitle: 'API Development', customCriteria: 'Build 8 REST APIs with proper documentation' },
    { employeeId: employees[2].id, goalId: goals[5].id, customTitle: 'Learn Cloud Technologies', customCriteria: 'Complete AWS certification course' },
    { employeeId: employees[7].id, goalId: goals[1].id, customTitle: 'CI/CD Pipeline Optimization', customCriteria: 'Reduce build time by 30%, achieve 90% pipeline success rate' },
    // Product team
    { employeeId: employees[3].id, goalId: goals[3].id, customTitle: 'User Research & Analytics', customCriteria: 'Conduct 5 user interviews, create 3 persona documents' },
    { employeeId: employees[4].id, goalId: goals[0].id, customTitle: 'Feature Specs & Roadmap', customCriteria: 'Deliver specs for 4 new features, maintain product backlog' },
    // Design team
    { employeeId: employees[5].id, goalId: goals[4].id, customTitle: 'Component Library Creation', customCriteria: 'Create 20 reusable UI components with documentation' },
    { employeeId: employees[6].id, goalId: goals[2].id, customTitle: 'User Research Support', customCriteria: 'Support 3 usability testing sessions, create journey maps' }
  ];
  
  for (const ga of goalAssignments) {
    db.run(
      `INSERT OR IGNORE INTO employee_goals (id, employee_id, goal_id, customized_title, customized_criteria, assigned_by, assigned_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), ga.employeeId, ga.goalId, ga.customTitle, ga.customCriteria, managers[0].id, now, 'ACTIVE']
    );
  }
  console.log(`Created ${goalAssignments.length} goal assignments`);
  
  // 5. Add progress updates and AI feedback
  const allGoals = db.all('SELECT eg.*, u.name as employee_name, u.position, u.department, u.id as employee_id, g.title, g.description, g.success_criteria FROM employee_goals eg JOIN users u ON eg.employee_id = u.id JOIN goals g ON eg.goal_id = g.id');
  
  const progressData = [
    { goalIdx: 0, completion: 85, update: 'Completed 4 of 5 microservices migration. Final service in progress.' },
    { goalIdx: 1, completion: 70, update: 'Held 4 weekly 1:1s, reviewed 8 pull requests, conducted 2 tech talks.' },
    { goalIdx: 2, completion: 60, update: 'Completed 9 of 15 user stories. Working on remaining items.' },
    { goalIdx: 3, completion: 75, update: 'Increased test coverage from 50% to 72%. Added 50 new unit tests.' },
    { goalIdx: 4, completion: 55, update: 'Built 5 REST APIs, documented 4 of them.' },
    { goalIdx: 5, completion: 40, update: 'Completed AWS Fundamentals course, studying for exam.' },
    { goalIdx: 6, completion: 80, update: 'Reduced build time by 25%, pipeline success at 88%.' },
    { goalIdx: 7, completion: 90, update: 'Conducted 5 user interviews, created detailed personas.' },
    { goalIdx: 8, completion: 65, update: 'Delivered specs for 3 features, backlog prioritized.' },
    { goalIdx: 9, completion: 70, update: 'Created 15 components with Storybook documentation.' },
    { goalIdx: 10, completion: 85, update: 'Supported 3 usability tests, created journey maps for main flows.' }
  ];
  
  for (let i = 0; i < progressData.length && i < allGoals.length; i++) {
    const pd = progressData[i];
    const empGoal = allGoals[pd.goalIdx];
    
    if (empGoal) {
      // Add progress update
      db.run(
        `INSERT INTO progress_updates (id, employee_goal_id, completion_percentage, update_text, time_period, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv4(), empGoal.id, pd.completion, pd.update, 'Weekly', now]
      );
      
      // Generate AI feedback for this progress
      const AIService = require('../services/aiService');
      try {
        await AIService.generateGoalFeedback(
          { id: empGoal.employee_id, name: empGoal.employee_name, position: empGoal.position, department: empGoal.department },
          { id: empGoal.goal_id, title: empGoal.customized_title || empGoal.title, success_criteria: empGoal.customized_criteria || empGoal.success_criteria },
          { completion_percentage: pd.completion, update_text: pd.update, time_period: 'Weekly' }
        );
      } catch (e) {
        console.log('AI feedback error:', e.message);
      }
    }
  }
  console.log(`Created ${progressData.length} progress updates with AI feedback`);
  
  // 6. Add some employee empathy events (life events)
  const lifeEvents = [
    { employeeId: employees[2].id, eventType: 'ILLNESS', startDate: '2026-01-15', endDate: '2026-02-15', reason: 'Medical leave for surgery recovery' },
  ];
  
  for (const le of lifeEvents) {
    const EmpathyService = require('../services/empathyService');
    EmpathyService.recordLifeEvent(le.employeeId, le.eventType, le.startDate, le.endDate, le.reason);
  }
  console.log(`Created ${lifeEvents.length} life event records`);
  
  // 7. Add employee recommendations
  const recommendationsData = [
    { employeeId: employees[0].id, type: 'LEARNING', title: 'Advanced System Design', desc: 'Take Advanced System Design course on Coursera', priority: 'HIGH' },
    { employeeId: employees[0].id, type: 'CAREER_PATH', title: 'Tech Lead Path', desc: 'Consider tech lead track based on mentorship skills', priority: 'MEDIUM' },
    { employeeId: employees[1].id, type: 'SKILL_GAP', title: 'Technical Writing', desc: 'Focus on improving documentation and technical writing skills', priority: 'HIGH' },
    { employeeId: employees[2].id, type: 'LEARNING', title: 'Cloud Certification', desc: 'Complete AWS Solutions Architect certification', priority: 'HIGH' },
    { employeeId: employees[3].id, type: 'SKILL_GAP', title: 'Data Analysis', desc: 'Strengthen SQL and data visualization skills', priority: 'MEDIUM' },
  ];
  
  for (const rec of recommendationsData) {
    db.run(
      `INSERT INTO recommendations (id, employee_id, recommendation_type, title, description, priority, confidence_score, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), rec.employeeId, rec.type, rec.title, rec.desc, rec.priority, 0.85, now]
    );
  }
  console.log(`Created ${recommendationsData.length} recommendations`);
  
  // 8. Create some ratings
  const ratingsData = [
    { employeeId: employees[0].id, rawScore: 0.88, period: '2025 Q4' },
    { employeeId: employees[1].id, rawScore: 0.72, period: '2025 Q4' },
    { employeeId: employees[2].id, rawScore: 0.65, period: '2025 Q4' },
    { employeeId: employees[3].id, rawScore: 0.82, period: '2025 Q4' },
  ];
  
  const admin = db.get("SELECT id FROM users WHERE role = 'ADMIN'");
  if (admin) {
    for (const r of ratingsData) {
      db.run(
        `INSERT INTO ratings (id, employee_id, manager_id, rating_period, raw_score, final_score, adjustment_explanation, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), r.employeeId, admin.id, r.period, r.rawScore, r.rawScore, 'Based on Q4 2025 evaluation period', now]
      );
    }
  }
  console.log(`Created ${ratingsData.length} ratings`);
  
  console.log('\n✅ Database seeded successfully!');
  console.log('\nDemo Login Credentials:');
  console.log('=========================');
  console.log('Admin: admin@company.com / admin123');
  console.log('Manager: sarah.johnson@company.com / password123');
  console.log('Employee: john.smith@company.com / password123');
}

module.exports = seedDatabase;

// Run if called directly
if (require.main === module) {
  seedDatabase().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}