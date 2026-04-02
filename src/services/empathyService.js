/**
 * Empathy Adjustment Service
 * Handles life events and automatic rating adjustments
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');

class EmpathyService {
  /**
   * Record a life event that affects ratings
   */
  static recordLifeEvent(employeeId, eventType, startDate, endDate, reason = null) {
    // Determine default adjustment method based on event type
    const adjustment = this.getAdjustmentForEvent(eventType);
    const eventId = uuidv4();

    db.run(
      `INSERT INTO empathy_adjustments 
       (id, employee_id, event_type, start_date, end_date, adjustment_method, adjustment_percentage, reason_text, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [eventId, employeeId, eventType, startDate, endDate, adjustment.method, adjustment.boost_percentage || 0, reason, new Date().toISOString()]
    );

    // Log to audit
    this.logAudit('EMPATHY_EVENT', eventId, 'CREATE', null, {
      employee_id: employeeId,
      event_type: eventType,
      start_date: startDate,
      end_date: endDate,
      method: adjustment.method
    });

    return { id: eventId, event_type: eventType, start_date: startDate, end_date: endDate, method: adjustment.method };
  }

  /**
   * Calculate adjusted rating with empathy consideration
   */
  static calculateAdjustedRating(employeeId, rawScore, ratingPeriodStart, ratingPeriodEnd) {
    // Get any life events during this period
    const lifeEvents = db.all(
      `SELECT * FROM empathy_adjustments 
       WHERE employee_id = ? 
       AND start_date <= ? 
       AND end_date >= ?`,
      [employeeId, ratingPeriodEnd, ratingPeriodStart]
    );

    if (lifeEvents.length === 0) {
      return {
        raw_score: Math.round(rawScore * 100) / 100,
        adjusted_score: Math.round(rawScore * 100) / 100,
        adjustment_method: 'NONE',
        adjustment_percentage: 0,
        adjustment_reason: 'No life events recorded',
        explanation: 'Rating based on full evaluation period'
      };
    }

    let adjustedScore = rawScore;
    let adjustmentDetails = [];

    for (const event of lifeEvents) {
      const adjustment = this.getAdjustmentForEvent(event.event_type);

      if (adjustment.method === 'EXCLUDE') {
        // Calculate % of period to exclude
        const periodDays = this.daysBetween(ratingPeriodStart, ratingPeriodEnd);
        const eventDays = this.daysBetween(
          new Date(Math.max(new Date(event.start_date), new Date(ratingPeriodStart))),
          new Date(Math.min(new Date(event.end_date), new Date(ratingPeriodEnd)))
        );
        
        const activePercentage = (periodDays - eventDays) / periodDays;

        // Re-scale score to active period (capped at 1.0)
        adjustedScore = Math.min(1.0, rawScore / activePercentage);

        adjustmentDetails.push({
          event_type: event.event_type,
          method: 'EXCLUDE',
          days_affected: eventDays,
          active_percentage: Math.round(activePercentage * 100),
          reason: `${event.event_type} excluded from evaluation`
        });
      }

      if (adjustment.method === 'PRORATE') {
        const periodDays = this.daysBetween(ratingPeriodStart, ratingPeriodEnd);
        const eventDays = this.daysBetween(
          new Date(Math.max(new Date(event.start_date), new Date(ratingPeriodStart))),
          new Date(Math.min(new Date(event.end_date), new Date(ratingPeriodEnd)))
        );

        const activePercentage = (periodDays - eventDays) / periodDays;

        // Prorate with 0.50 baseline floor
        adjustedScore = Math.max(0.50, rawScore * activePercentage + (0.50 * (1 - activePercentage)));

        adjustmentDetails.push({
          event_type: event.event_type,
          method: 'PRORATE',
          days_affected: eventDays,
          active_percentage: Math.round(activePercentage * 100),
          baseline_score: 0.50
        });
      }

      if (adjustment.method === 'BOOST') {
        const boostAmount = (adjustment.boost_percentage || 0) / 100;
        adjustedScore = Math.min(1.0, adjustedScore + boostAmount);

        adjustmentDetails.push({
          event_type: event.event_type,
          method: 'BOOST',
          boost_amount: adjustment.boost_percentage,
          reason: `Adjusted up ${adjustment.boost_percentage}% for managing during ${event.event_type}`
        });
      }
    }

    // Log adjustment in audit trail
    this.logAudit('RATING', employeeId, 'EMPATHY_ADJUSTMENT', null, {
      raw_score: rawScore,
      adjusted_score: adjustedScore,
      adjustments: adjustmentDetails
    });

    return {
      raw_score: Math.round(rawScore * 100) / 100,
      adjusted_score: Math.round(adjustedScore * 100) / 100,
      adjustment_methods: adjustmentDetails,
      explanation: this.buildExplanation(rawScore, adjustedScore, adjustmentDetails)
    };
  }

  /**
   * Get adjustment strategy for event type
   */
  static getAdjustmentForEvent(eventType) {
    const adjustments = {
      'MATERNITY': { method: 'EXCLUDE', boost_percentage: 0 },
      'MATERNITY_LEAVE': { method: 'EXCLUDE', boost_percentage: 0 },
      'PATERNITY': { method: 'EXCLUDE', boost_percentage: 0 },
      'PATERNITY_LEAVE': { method: 'EXCLUDE', boost_percentage: 0 },
      'BEREAVEMENT': { method: 'PRORATE', boost_percentage: 0 },
      'ILLNESS': { method: 'PRORATE', boost_percentage: 0 },
      'SICK_LEAVE': { method: 'PRORATE', boost_percentage: 0 },
      'SABBATICAL': { method: 'PRORATE', boost_percentage: 0 },
      'CAREGIVING': { method: 'PRORATE', boost_percentage: 5 },
      'FAMILY_EMERGENCY': { method: 'PRORATE', boost_percentage: 5 },
      'PERSONAL_EMERGENCY': { method: 'PRORATE', boost_percentage: 5 }
    };

    return adjustments[eventType] || { method: 'PRORATE', boost_percentage: 0 };
  }

  /**
   * Get all life events for an employee
   */
  static getEmployeeLifeEvents(employeeId) {
    return db.all(
      `SELECT * FROM empathy_adjustments WHERE employee_id = ? ORDER BY start_date DESC`,
      [employeeId]
    );
  }

  /**
   * Verify a life event (manager/HR approval)
   */
  static verifyLifeEvent(eventId, verifiedBy) {
    db.run(
      `UPDATE empathy_adjustments SET verified_by = ? WHERE id = ?`,
      [verifiedBy, eventId]
    );

    this.logAudit('EMPATHY_EVENT', eventId, 'VERIFY', verifiedBy, { verified: true });
    
    return { success: true, event_id: eventId };
  }

  /**
   * Calculate days between two dates
   */
  static daysBetween(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffTime = Math.abs(d2 - d1);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Build human-readable explanation of adjustment
   */
  static buildExplanation(raw, adjusted, details) {
    let explanation = `Raw rating: ${(raw * 100).toFixed(0)}%. `;

    for (const detail of details) {
      if (detail.method === 'EXCLUDE') {
        explanation += `${detail.event_type} removed from evaluation (${detail.days_affected} days). `;
      } else if (detail.method === 'PRORATE') {
        explanation += `${detail.event_type} impacted ${100 - detail.active_percentage}% of period; adjusted to baseline of 50%. `;
      } else if (detail.method === 'BOOST') {
        explanation += `Added ${detail.boost_amount}% credit for managing during ${detail.event_type}. `;
      }
    }

    explanation += `Adjusted rating: ${(adjusted * 100).toFixed(0)}%.`;
    return explanation;
  }

  /**
   * Log audit entry
   */
  static logAudit(entityType, entityId, action, actorId, changes) {
    const id = uuidv4();
    db.run(
      `INSERT INTO audit_logs (id, entity_type, entity_id, action, actor_id, changes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, entityType, entityId, action, actorId || 'SYSTEM', JSON.stringify(changes), new Date().toISOString()]
    );
  }
}

module.exports = EmpathyService;