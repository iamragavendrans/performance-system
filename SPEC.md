# AI-Powered Performance System - MVP Specification

## Overview

A lightweight, browser-based performance rating system that combines goal tracking with AI-generated insights and empathy adjustments. No installation required - just open the HTML file.

## Design Principles

1. **Zero Dependencies**: Single HTML file, uses CDN for CSS/JS only
2. **Role-Based**: Three views - Employee, Manager, Admin
3. **AI-Powered**: Pattern-based mock AI generates feedback
4. **Fair**: Empathy adjustments for life events (maternity, illness, etc.)

## User Roles

### Employee
- View assigned goals
- Submit weekly progress updates
- See AI-generated feedback
- View final rating with empathy adjustments

### Manager
- View team performance dashboard
- Customize and assign goals
- Record life events (empathy adjustments)
- Finalize ratings
- See AI-generated team insights

### Admin
- Create company goals
- Manage users
- View organization-wide metrics

## Data Model

### User
```javascript
{
  id: string,
  name: string,
  email: string,
  role: 'employee' | 'manager' | 'admin',
  managerId: string | null,
  createdAt: timestamp
}
```

### Goal
```javascript
{
  id: string,
  title: string,
  description: string,
  successCriteria: string,
  competencies: string[],
  createdBy: string,
  createdAt: timestamp
}
```

### EmployeeGoal (Assignment)
```javascript
{
  id: string,
  employeeId: string,
  goalId: string,
  targetDate: date,
  assignedBy: string,
  status: 'active' | 'completed' | 'cancelled',
  createdAt: timestamp
}
```

### ProgressUpdate
```javascript
{
  id: string,
  employeeGoalId: string,
  completionPercentage: number,
  text: string,
  evidence: string | null,
  createdAt: timestamp
}
```

### AIFeedback
```javascript
{
  id: string,
  employeeId: string,
  goalId: string,
  progressUpdateId: string,
  type: 'STRENGTH' | 'DEVELOPMENT_AREA' | 'INSIGHT',
  title: string,
  text: string,
  confidence: number,
  createdAt: timestamp
}
```

### EmpathyEvent
```javascript
{
  id: string,
  employeeId: string,
  eventType: 'MATERNITY' | 'PATERNITY' | 'BEREAVEMENT' | 'ILLNESS' | 'SABBATICAL' | 'CAREGIVING',
  startDate: date,
  endDate: date,
  adjustmentMethod: 'EXCLUDE' | 'PRORATE' | 'BOOST',
  verifiedBy: string,
  reason: string,
  createdAt: timestamp
}
```

### Rating
```javascript
{
  id: string,
  employeeId: string,
  period: string,
  rawScore: number,
  adjustedScore: number,
  adjustmentExplanation: string,
  finalizedBy: string,
  finalizedAt: timestamp
}
```

## UI Components

### Navigation
- Top bar with role indicator
- Role switcher (demo mode)
- Current user display

### Employee Dashboard
- Goal cards with progress bars
- "Update Progress" button per goal
- AI Feedback section per goal
- Overall rating display

### Manager Dashboard
- Team member list with ratings
- Empathy event panel
- "Record Life Event" form
- AI Team Insights section

### Admin Dashboard
- Goal creation form
- User management table
- Add user form

## AI Mock Engine

### Feedback Generation
Pattern-based feedback based on:
- Progress percentage (high/low/mid)
- Update text keywords
- Previous feedback history

**Feedback Types:**
- STRENGTH: "You completed 90% ahead of target - strong execution"
- DEVELOPMENT_AREA: "Q3 progress slowed - consider breaking down tasks"
- INSIGHT: "Your technical output is strong - document findings for team"

### Team Insights
Aggregates:
- Average completion rates
- Common strengths/gaps
- High performers
- At-risk employees

## Empathy Adjustment Logic

### Methods

**EXCLUDE** (Maternity, Paternity):
- Period removed from evaluation
- Score recalculated on active period only

**PRORATE** (Bereavement, Illness, Sabbatical):
- Score adjusted based on time active
- Minimum baseline of 50%

**BOOST** (Caregiving):
- Add 5% credit for managing responsibilities

### Calculation Example
```
Raw Score: 0.65 (Developing)
Event: Medical leave 3 months (50% of period)
Method: PRORATE

Calculation: 0.65 × 0.50 + (0.50 × 0.50) = 0.575
Adjusted Score: 0.70 (Meets Expectations)
```

## Technical Stack

| Component | Technology |
|-----------|------------|
| HTML | Single file |
| CSS | Tailwind CSS (CDN) |
| JavaScript | Vanilla ES6 |
| Storage | LocalStorage |
| Icons | Heroicons (SVG inline) |

## Color Scheme

| Purpose | Color |
|---------|-------|
| Primary | Blue (bg-blue-600) |
| Success | Green (bg-green-500) |
| Warning | Amber (bg-amber-500) |
| Danger | Red (bg-red-500) |
| Strength | Emerald (text-emerald-600) |
| Development | Orange (text-orange-600) |
| Insight | Purple (text-purple-600) |

## Rating Scale

| Score Range | Label | Badge Color |
|-------------|-------|--------------|
| 0.85 - 1.00 | Exceeds Expectations | Green |
| 0.70 - 0.84 | Meets Expectations | Blue |
| 0.50 - 0.69 | Developing | Amber |
| < 0.50 | Needs Improvement | Red |

## Success Criteria

1. Open `index.html` in browser → System works
2. Employee submits progress → AI feedback appears
3. Manager records life event → Rating adjusts
4. All data persists across sessions
5. Responsive on mobile devices

---

*Generated from MVP documents*
*Architecture: Single-file HTML with LocalStorage*