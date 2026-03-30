/**
 * AI Service - Claude API Integration
 * Generates feedback, team reports, and recommendations
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');

// Placeholder for Claude API - will use mock data if no API key
const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
const USE_MOCK_AI = !CLAUDE_API_KEY;

class AIService {
  /**
   * Generate feedback for an employee on a goal
   */
  static async generateGoalFeedback(employeeData, goalData, progressUpdate) {
    // If no API key, use mock feedback generation
    if (USE_MOCK_AI) {
      return this.generateMockFeedback(employeeData, goalData, progressUpdate);
    }

    // Build prompt for Claude
    const prompt = this.buildFeedbackPrompt(employeeData, goalData, progressUpdate);

    try {
      const response = await this.callClaudeAPI(prompt);
      const feedbackJson = this.parseAIResponse(response);
      
      // Store feedback in database
      const feedbackItems = this.storeFeedbackItems(employeeData.id, goalData.id, feedbackJson);
      return feedbackItems;
    } catch (error) {
      console.error('AI feedback generation error:', error);
      // Fallback to mock if API fails
      return this.generateMockFeedback(employeeData, goalData, progressUpdate);
    }
  }

  /**
   * Generate team performance report
   */
  static async generateTeamReport(managerId, ratingPeriod) {
    // Get all employees for this manager
    const employees = db.all(
      `SELECT u.*, r.final_score, r.raw_score 
       FROM users u 
       LEFT JOIN ratings r ON u.id = r.employee_id AND r.rating_period = ?
       WHERE u.manager_id = ?`,
      [ratingPeriod, managerId]
    );

    // Calculate team metrics
    const teamMetrics = this.calculateTeamMetrics(employees);

    if (USE_MOCK_AI) {
      return this.generateMockTeamReport(employees, teamMetrics);
    }

    const prompt = this.buildTeamReportPrompt(employees, teamMetrics);

    try {
      const response = await this.callClaudeAPI(prompt);
      const reportJson = this.parseAIResponse(response);
      
      // Store report
      this.storeTeamReport(managerId, ratingPeriod, reportJson);
      return reportJson;
    } catch (error) {
      console.error('AI team report error:', error);
      return this.generateMockTeamReport(employees, teamMetrics);
    }
  }

  /**
   * Generate personalized recommendations for an employee
   */
  static async generateRecommendations(employeeData, ratings, feedback) {
    if (USE_MOCK_AI) {
      return this.generateMockRecommendations(employeeData);
    }

    const prompt = this.buildRecommendationsPrompt(employeeData, ratings, feedback);

    try {
      const response = await this.callClaudeAPI(prompt);
      const recJson = this.parseAIResponse(response);
      
      const recommendations = this.storeRecommendations(employeeData.id, recJson);
      return recommendations;
    } catch (error) {
      console.error('AI recommendations error:', error);
      return this.generateMockRecommendations(employeeData);
    }
  }

  // ============ API Call Methods ============

  static async callClaudeAPI(prompt) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  // ============ Prompt Builders ============

  static buildFeedbackPrompt(employee, goal, progress) {
    return `You are a supportive performance feedback expert. Generate constructive, specific feedback.

Employee: ${employee.name}
Role: ${employee.position || 'Employee'}
Department: ${employee.department || 'General'}

Goal: ${goal.title || goal.customized_title || 'Goal'}
Success Criteria: ${goal.success_criteria || goal.customized_criteria || 'Not specified'}

Progress Update:
- Completion: ${progress.completion_percentage}%
- What they accomplished: ${progress.update_text || 'No details provided'}
- Time period: ${progress.time_period || 'Recent'}

Generate 2-3 specific feedback points:
1. One STRENGTH they demonstrated (be specific with evidence)
2. One DEVELOPMENT AREA they should work on (constructive, not critical)
3. One INSIGHT or observation about their performance

Format response as JSON:
{
  "strengths": [{"title": "string", "description": "specific, evidence-based feedback"}],
  "development_areas": [{"title": "string", "description": "constructive feedback with suggestion"}],
  "insights": [{"title": "string", "description": "observation or pattern noticed"}]
}`;
  }

  static buildTeamReportPrompt(employees, metrics) {
    return `You are a talent analytics expert. Analyze this team's performance and provide strategic insights.

Team Size: ${employees.length} people
Average Goal Completion: ${metrics.avgCompletion}%
Top Performers: ${metrics.topPerformers.join(', ') || 'None yet'}
Performance Distribution: ${metrics.distribution}

Generate a team report with:
1. Team Strengths (2-3 key areas where team excels)
2. Opportunity Areas (2-3 areas for team development)
3. Performance Patterns (any trends or anomalies)
4. Strategic Recommendations (3 specific actions for manager)

Format as JSON:
{
  "team_strengths": ["string", ...],
  "opportunity_areas": ["string", ...],
  "patterns": ["string", ...],
  "recommendations": [{"title": "string", "description": "specific, actionable", "priority": "HIGH|MEDIUM|LOW"}],
  "summary": "executive summary paragraph"
}`;
  }

  static buildRecommendationsPrompt(employee, ratings, feedback) {
    return `You are a talent development specialist. Generate personalized growth recommendations.

Employee: ${employee.name}
Role: ${employee.position || 'Employee'}
Experience: ${employee.years_in_role || 0} years
Overall Performance: ${ratings?.final_rating || 'Not rated'}

Key Strengths: ${feedback?.strengths || 'Data not available'}
Development Needs: ${feedback?.gaps || 'Data not available'}
Career Interests: ${employee.career_goals || 'Not specified'}

Generate 3 specific, actionable recommendations:
1. Learning & Development: A course, certification, or learning path
2. Skill Development: A specific skill to develop with how-to
3. Career Path: Role progression or lateral move suggestion

Format as JSON:
{
  "learning": {"title": "string", "description": "what and why", "resource": "specific course or program", "timeline": "timeframe"},
  "skill_development": {"skill": "string", "action_plan": "specific steps", "timeline": "timeframe"},
  "career": {"suggested_path": "role or direction", "timeline": "when ready", "preparation": "what to do now"}
}`;
  }

  // ============ Response Parsers ============

  static parseAIResponse(responseText) {
    try {
      // Try to extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('No JSON found in response');
    } catch (error) {
      console.warn('Failed to parse AI response, using default:', error);
      return {};
    }
  }

  // ============ Storage Methods ============

  static storeFeedbackItems(employeeId, goalId, feedbackJson) {
    const feedbackItems = [];
    const now = new Date().toISOString();

    // Store strengths
    if (feedbackJson.strengths) {
      for (const item of feedbackJson.strengths) {
        const id = uuidv4();
        db.run(
          `INSERT INTO ai_feedback (id, employee_id, goal_id, feedback_type, title, ai_generated_text, confidence_score, data_sources, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, employeeId, goalId, 'STRENGTH', item.title || 'Strength', item.description || '', 0.9, JSON.stringify(['progress_update', 'goal_criteria']), now]
        );
        feedbackItems.push({ id, type: 'STRENGTH', title: item.title, description: item.description });
      }
    }

    // Store development areas
    if (feedbackJson.development_areas) {
      for (const item of feedbackJson.development_areas) {
        const id = uuidv4();
        db.run(
          `INSERT INTO ai_feedback (id, employee_id, goal_id, feedback_type, title, ai_generated_text, confidence_score, data_sources, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, employeeId, goalId, 'DEVELOPMENT_AREA', item.title || 'Development Area', item.description || '', 0.85, JSON.stringify(['progress_update', 'goal_criteria']), now]
        );
        feedbackItems.push({ id, type: 'DEVELOPMENT_AREA', title: item.title, description: item.description });
      }
    }

    // Store insights
    if (feedbackJson.insights) {
      for (const item of feedbackJson.insights) {
        const id = uuidv4();
        db.run(
          `INSERT INTO ai_feedback (id, employee_id, goal_id, feedback_type, title, ai_generated_text, confidence_score, data_sources, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, employeeId, goalId, 'INSIGHT', item.title || 'Insight', item.description || '', 0.8, JSON.stringify(['progress_update', 'performance_pattern']), now]
        );
        feedbackItems.push({ id, type: 'INSIGHT', title: item.title, description: item.description });
      }
    }

    return feedbackItems;
  }

  static storeTeamReport(managerId, period, reportData) {
    const id = uuidv4();
    db.run(
      `INSERT OR REPLACE INTO team_reports (id, manager_id, period, report_data, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, managerId, period, JSON.stringify(reportData), new Date().toISOString()]
    );
  }

  static storeRecommendations(employeeId, recJson) {
    const recommendations = [];
    const now = new Date().toISOString();

    if (recJson.learning) {
      const id = uuidv4();
      db.run(
        `INSERT INTO recommendations (id, employee_id, recommendation_type, title, description, action_items, priority, confidence_score, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, employeeId, 'LEARNING', recJson.learning.title || 'Learning', recJson.learning.description || '', JSON.stringify(recJson.learning), 'HIGH', 0.9, now]
      );
      recommendations.push({ id, type: 'LEARNING', ...recJson.learning });
    }

    if (recJson.skill_development) {
      const id = uuidv4();
      db.run(
        `INSERT INTO recommendations (id, employee_id, recommendation_type, title, description, action_items, priority, confidence_score, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, employeeId, 'SKILL_GAP', recJson.skill_development.skill || 'Skill Development', recJson.skill_development.action_plan || '', JSON.stringify(recJson.skill_development), 'HIGH', 0.88, now]
      );
      recommendations.push({ id, type: 'SKILL_GAP', ...recJson.skill_development });
    }

    if (recJson.career) {
      const id = uuidv4();
      db.run(
        `INSERT INTO recommendations (id, employee_id, recommendation_type, title, description, action_items, priority, confidence_score, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, employeeId, 'CAREER_PATH', recJson.career.suggested_path || 'Career Path', recJson.career.rationale || '', JSON.stringify(recJson.career), 'MEDIUM', 0.85, now]
      );
      recommendations.push({ id, type: 'CAREER_PATH', ...recJson.career });
    }

    return recommendations;
  }

  // ============ Team Metrics Calculator ============

  static calculateTeamMetrics(employees) {
    const rated = employees.filter(e => e.final_score !== null);
    const avgCompletion = rated.length > 0 
      ? rated.reduce((sum, e) => sum + (e.final_score || 0), 0) / rated.length * 100 
      : 0;
    
    const topPerformers = rated
      .filter(e => e.final_score >= 0.85)
      .map(e => e.name);

    const exceeds = rated.filter(e => e.final_score >= 0.85).length;
    const meets = rated.filter(e => e.final_score >= 0.70 && e.final_score < 0.85).length;
    const developing = rated.filter(e => e.final_score < 0.70).length;

    return {
      avgCompletion: Math.round(avgCompletion),
      topPerformers,
      distribution: `Exceeds: ${exceeds}, Meets: ${meets}, Developing: ${developing}`
    };
  }

  // ============ Mock Data Generators ============

  static generateMockFeedback(employee, goal, progress) {
    const now = new Date().toISOString();
    const feedbackItems = [];
    
    const mockStrengths = [
      'Consistent progress tracking',
      'Strong initiative in goal completion',
      'Good documentation of achievements',
      'Proactive problem-solving approach'
    ];

    const mockDevAreas = [
      'Could benefit from more cross-team collaboration',
      'Time management during peak periods needs attention',
      'Consider documenting processes for team benefit',
      'May want to stretch goals for greater impact'
    ];

    const mockInsights = [
      'Showing positive improvement trend',
      'Strong alignment with role expectations',
      'Good engagement with feedback'
    ];

    // Store mock strength
    const strengthId = uuidv4();
    const randomStrength = mockStrengths[Math.floor(Math.random() * mockStrengths.length)];
    db.run(
      `INSERT INTO ai_feedback (id, employee_id, goal_id, feedback_type, title, ai_generated_text, confidence_score, data_sources, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [strengthId, employee.id, goal.id, 'STRENGTH', 'Strength', `${randomStrength}. Based on ${progress.completion_percentage}% completion this period.`, 0.75, JSON.stringify(['progress_update']), now]
    );
    feedbackItems.push({ id: strengthId, type: 'STRENGTH', title: 'Strength', description: randomStrength });

    // Store mock development area
    const devId = uuidv4();
    const randomDev = mockDevAreas[Math.floor(Math.random() * mockDevAreas.length)];
    db.run(
      `INSERT INTO ai_feedback (id, employee_id, goal_id, feedback_type, title, ai_generated_text, confidence_score, data_sources, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [devId, employee.id, goal.id, 'DEVELOPMENT_AREA', 'Development Area', randomDev, 0.70, JSON.stringify(['progress_update']), now]
    );
    feedbackItems.push({ id: devId, type: 'DEVELOPMENT_AREA', title: 'Development Area', description: randomDev });

    // Store mock insight
    const insightId = uuidv4();
    const randomInsight = mockInsights[Math.floor(Math.random() * mockInsights.length)];
    db.run(
      `INSERT INTO ai_feedback (id, employee_id, goal_id, feedback_type, title, ai_generated_text, confidence_score, data_sources, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [insightId, employee.id, goal.id, 'INSIGHT', 'Insight', randomInsight, 0.65, JSON.stringify(['performance_pattern']), now]
    );
    feedbackItems.push({ id: insightId, type: 'INSIGHT', title: 'Insight', description: randomInsight });

    return feedbackItems;
  }

  static generateMockTeamReport(employees, metrics) {
    const report = {
      team_strengths: [
        'Strong goal completion rate across the team',
        'Good collaboration and teamwork',
        'Consistent progress updates and documentation'
      ],
      opportunity_areas: [
        'Opportunity for more cross-functional projects',
        'Some team members could benefit from leadership development',
        'Documentation practices could be improved'
      ],
      patterns: [
        'Team showing steady improvement over the period',
        'Most employees meeting or exceeding expectations',
        'Good engagement with the performance system'
      ],
      recommendations: [
        { title: 'Team Learning Session', description: 'Schedule monthly knowledge sharing sessions', priority: 'MEDIUM' },
        { title: 'Peer Mentoring Program', description: 'Pair high performers with developing employees', priority: 'HIGH' },
        { title: 'Documentation Workshop', description: 'Train team on effective documentation practices', priority: 'LOW' }
      ],
      summary: `Your team of ${employees.length} members is performing well with an average completion rate of ${metrics.avgCompletion}%. ${metrics.topPerformers.length > 0 ? `${metrics.topPerformers.join(', ')} are showing exceptional performance. ` : ''}Continue supporting the team's growth through targeted development opportunities.`
    };

    return report;
  }

  static generateMockRecommendations(employee) {
    const recommendations = [];
    const now = new Date().toISOString();

    // Learning recommendation
    const learningId = uuidv4();
    const learning = { 
      title: 'Professional Development Course', 
      description: 'Enroll in relevant courses to enhance skills',
      resource: 'Online learning platform',
      timeline: 'Next 3 months'
    };
    db.run(
      `INSERT INTO recommendations (id, employee_id, recommendation_type, title, description, action_items, priority, confidence_score, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [learningId, employee.id, 'LEARNING', learning.title, learning.description, JSON.stringify(learning), 'HIGH', 0.75, now]
    );
    recommendations.push({ id: learningId, type: 'LEARNING', ...learning });

    // Skill development
    const skillId = uuidv4();
    const skill = {
      skill: 'Communication',
      action_plan: 'Practice presenting to team, seek feedback',
      timeline: '2 months'
    };
    db.run(
      `INSERT INTO recommendations (id, employee_id, recommendation_type, title, description, action_items, priority, confidence_score, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [skillId, employee.id, 'SKILL_GAP', skill.skill, skill.action_plan, JSON.stringify(skill), 'HIGH', 0.70, now]
    );
    recommendations.push({ id: skillId, type: 'SKILL_GAP', ...skill });

    // Career path
    const careerId = uuidv4();
    const career = {
      suggested_path: 'Senior role in current department',
      timeline: '12-18 months',
      preparation: 'Take on more responsibility, mentor others'
    };
    db.run(
      `INSERT INTO recommendations (id, employee_id, recommendation_type, title, description, action_items, priority, confidence_score, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [careerId, employee.id, 'CAREER_PATH', career.suggested_path, 'Based on your performance, consider progressing to a senior role', JSON.stringify(career), 'MEDIUM', 0.65, now]
    );
    recommendations.push({ id: careerId, type: 'CAREER_PATH', ...career });

    return recommendations;
  }
}

module.exports = AIService;