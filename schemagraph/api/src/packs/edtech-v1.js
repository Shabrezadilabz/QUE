/**
 * EdTech pack v1 — students, courses, enrollments, completion.
 */
export const EDTECH_PACK_V1 = {
  id: 'edtech-v1',
  industry: 'EdTech',
  displayName: 'EdTech · Enrollment & Completion',
  description:
    'Students, courses, and enrollments — completion rate, active learners, and cohort retention KPIs.',
  minMatchScore: 0.5,
  tableMatchers: [
    { pattern: 'students', weight: 1.0, entity: 'DimStudent' },
    { pattern: 'courses', weight: 0.95, entity: 'DimCourse' },
    { pattern: 'enrollments', weight: 0.95, entity: 'FactEnrollment' },
    { pattern: 'lessons', weight: 0.8, entity: 'DimLesson' },
    { pattern: 'progress', weight: 0.85, entity: 'FactProgress' },
  ],
  requiredForMonk: ['students', 'enrollments'],
  kpis: [
    {
      id: 'completion_rate',
      label: 'Course completion rate',
      ceoQuestion: 'What is our course completion rate?',
      sqlTemplate: `SELECT
  ROUND(100.0 * SUM(CASE WHEN e.status = 'completed' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2) AS completion_rate_pct
FROM {enrollments} e`,
    },
    {
      id: 'active_learners',
      label: 'Active learners (30d)',
      ceoQuestion: 'How many learners were active in the last 30 days?',
      sqlTemplate: `SELECT COUNT(DISTINCT p.student_id) AS active_learners
FROM {progress} p
WHERE p.last_activity_at >= CURRENT_DATE - INTERVAL '30 days'`,
    },
    {
      id: 'enrollments_open',
      label: 'Open enrollments',
      ceoQuestion: 'How many enrollments are in progress?',
      sqlTemplate: `SELECT COUNT(*) AS open_enrollments
FROM {enrollments} e
WHERE e.status IN ('active', 'in_progress')`,
    },
  ],
  jobs: [
    {
      id: 'completion_funnel',
      title: 'Completion funnel',
      description: 'Enrollment status by course for steward review.',
      sql: `SELECT c.course_id, c.title, e.status, COUNT(*) AS n
FROM {enrollments} e
JOIN {courses} c ON e.course_id = c.course_id
GROUP BY 1, 2, 3
ORDER BY 4 DESC
LIMIT 200`,
    },
  ],
  qualityRules: [
    {
      id: 'orphan_enrollment',
      severity: 'high',
      title: 'Enrollments missing student link',
      description: 'enrollment.student_id should reference students.student_id',
    },
  ],
  capabilities: [
    { id: 'learning_chat', label: 'Learning analytics chat', href: '/chat' },
    { id: 'joins_edtech', label: 'Enrollment join graph', href: '/joins' },
    { id: 'metrics_kpis', label: 'EdTech KPIs', href: '/metrics' },
    { id: 'golden_eval', label: 'Golden eval', href: '/eval' },
  ],
  dashboards: [],
  goldenPairSource: null,
  templatePackId: 'edtech-enrollment',
}
