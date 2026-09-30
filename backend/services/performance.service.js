/**
 * services/performance.service.js
 * Pure calculation layer for negotiation performance metrics.
 *
 * All functions are stateless — they take an array of session documents
 * and return computed analytics. No database access here.
 */

'use strict';

/**
 * Calculate overall performance score (0-100) from session data.
 * Score formula:
 *   40% — satisfaction score (avg across agents)
 *   25% — efficiency (fewer rounds used out of max = better)
 *   20% — success bonus (agreement reached)
 *   15% — concession management (lower % conceded = better control)
 */
function calculateSessionScore(session) {
  let score = 0;

  // 1. Satisfaction component (40%)
  const satisfactionScores = (session.participants || [])
    .map(p => p.satisfaction)
    .filter(s => s != null);
  if (satisfactionScores.length > 0) {
    const avgSatisfaction = satisfactionScores.reduce((a, b) => a + b, 0) / satisfactionScores.length;
    score += avgSatisfaction * 0.4;
  }

  // 2. Efficiency component (25%)
  const rounds = session.totalRounds || 1;
  const maxRounds = session.maxRounds || 10;
  const efficiency = Math.max(0, (1 - (rounds / maxRounds)) * 100);
  score += efficiency * 0.25;

  // 3. Success bonus (20%)
  if (session.outcome === 'agreement') {
    score += 20;
  }

  // 4. Concession management (15%)
  const concessionPct = session.concessionStats?.averagePercentage || 0;
  const concessionScore = Math.max(0, 100 - concessionPct * 3); // penalize high %
  score += concessionScore * 0.15;

  return Math.round(Math.min(100, Math.max(0, score)));
}

/**
 * Calculate performance metrics from an array of sessions.
 * @param {object[]} sessions — array of session documents
 * @returns {object} comprehensive dashboard data
 */
function calculatePerformance(sessions) {
  if (!sessions || sessions.length === 0) {
    return {
      totalSessions: 0,
      successfulSessions: 0,
      failedSessions: 0,
      successRate: 0,
      averageRounds: 0,
      averageScore: 0,
      scoreTrend: 0,
      concessionStats: {
        averagePercentage: 0,
        totalConcessions: 0,
        largestConcession: 0,
        averageOfferMovement: 0,
      },
      performanceTrend: [],
      scenarioStats: [],
      insights: [],
    };
  }

  const total = sessions.length;
  const successful = sessions.filter(s => s.outcome === 'agreement').length;
  const failed = total - successful;
  const successRate = Math.round((successful / total) * 100);

  // Average rounds
  const totalRoundsSum = sessions.reduce((sum, s) => sum + (s.totalRounds || 0), 0);
  const averageRounds = parseFloat((totalRoundsSum / total).toFixed(1));

  // Average score
  const scores = sessions.map(s => s.performanceScore).filter(s => s != null);
  const averageScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;

  // Score trend (compare last 5 vs previous 5)
  const scoreTrend = calculateScoreTrend(sessions);

  // Concession stats
  const concessionStats = calculateConcessionStats(sessions);

  // Performance trend over time
  const performanceTrend = calculatePerformanceTrend(sessions);

  // Scenario-level stats
  const scenarioStats = calculateScenarioStats(sessions);

  // Personal insights
  const insights = generateInsights(sessions, {
    averageScore, successRate, averageRounds, concessionStats, scenarioStats,
  });

  return {
    totalSessions: total,
    successfulSessions: successful,
    failedSessions: failed,
    successRate,
    averageRounds,
    averageScore,
    scoreTrend,
    concessionStats,
    performanceTrend,
    scenarioStats,
    insights,
  };
}

/**
 * Compare average score of recent sessions vs older sessions.
 */
function calculateScoreTrend(sessions) {
  if (sessions.length < 2) return 0;

  const sorted = [...sessions].sort((a, b) =>
    new Date(b.completedAt || b.createdAt) - new Date(a.completedAt || a.createdAt)
  );

  const half = Math.ceil(sorted.length / 2);
  const recent = sorted.slice(0, half);
  const older = sorted.slice(half);

  const recentAvg = recent.reduce((s, x) => s + (x.performanceScore || 0), 0) / recent.length;
  const olderAvg = older.length > 0
    ? older.reduce((s, x) => s + (x.performanceScore || 0), 0) / older.length
    : recentAvg;

  if (olderAvg === 0) return 0;
  return parseFloat(((recentAvg - olderAvg) / olderAvg * 100).toFixed(1));
}

/**
 * Aggregate concession statistics across all sessions.
 */
function calculateConcessionStats(sessions) {
  let totalConcessions = 0;
  let totalPct = 0;
  let pctCount = 0;
  let largest = 0;
  let totalMovement = 0;
  let movementCount = 0;

  for (const session of sessions) {
    const stats = session.concessionStats || {};
    totalConcessions += stats.totalConcessions || 0;
    if (stats.averagePercentage > 0) {
      totalPct += stats.averagePercentage;
      pctCount++;
    }
    if (stats.largestConcession > largest) {
      largest = stats.largestConcession;
    }
    if (stats.averageOfferMovement > 0) {
      totalMovement += stats.averageOfferMovement;
      movementCount++;
    }
  }

  return {
    totalConcessions,
    averagePercentage: pctCount > 0 ? parseFloat((totalPct / pctCount).toFixed(1)) : 0,
    largestConcession: largest,
    averageOfferMovement: movementCount > 0 ? Math.round(totalMovement / movementCount) : 0,
  };
}

/**
 * Build performance trend data points for chart visualization.
 * Groups sessions chronologically and computes rolling average score.
 */
function calculatePerformanceTrend(sessions) {
  const sorted = [...sessions].sort((a, b) =>
    new Date(a.completedAt || a.createdAt) - new Date(b.completedAt || b.createdAt)
  );

  return sorted.map((s, i) => ({
    index: i + 1,
    score: s.performanceScore || 0,
    date: s.completedAt || s.createdAt,
    scenario: s.scenarioName || 'Unknown',
    outcome: s.outcome,
  }));
}

/**
 * Calculate per-scenario performance breakdowns.
 */
function calculateScenarioStats(sessions) {
  const byScenario = {};

  for (const session of sessions) {
    const key = session.scenarioId || 'unknown';
    if (!byScenario[key]) {
      byScenario[key] = {
        scenarioId: key,
        scenarioName: session.scenarioName || 'Unknown',
        sessions: [],
      };
    }
    byScenario[key].sessions.push(session);
  }

  return Object.values(byScenario).map(group => {
    const total = group.sessions.length;
    const successful = group.sessions.filter(s => s.outcome === 'agreement').length;
    const scores = group.sessions.map(s => s.performanceScore).filter(s => s != null);
    const avgScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

    return {
      scenarioId: group.scenarioId,
      scenarioName: group.scenarioName,
      totalSessions: total,
      successfulSessions: successful,
      successRate: Math.round((successful / total) * 100),
      averageScore: avgScore,
    };
  });
}

/**
 * Generate personal insight strings from performance data.
 */
function generateInsights(sessions, metrics) {
  const insights = [];

  if (sessions.length < 3) {
    insights.push('Complete a few more negotiations to unlock detailed performance insights.');
    return insights;
  }

  // Improvement trend
  if (metrics.scoreTrend > 5) {
    insights.push(`You are improving — your average score has increased by ${metrics.scoreTrend}% in recent sessions.`);
  } else if (metrics.scoreTrend < -5) {
    insights.push(`Your recent performance has dipped by ${Math.abs(metrics.scoreTrend)}%. Consider reviewing your approach.`);
  } else {
    insights.push('Your performance has been consistent across recent sessions.');
  }

  // Best scenario
  if (metrics.scenarioStats.length > 1) {
    const best = [...metrics.scenarioStats].sort((a, b) => b.averageScore - a.averageScore)[0];
    if (best && best.averageScore > 0) {
      insights.push(`Your strongest performance is in ${best.scenarioName} (avg score: ${best.averageScore}).`);
    }
  }

  // Efficiency
  if (metrics.averageRounds < 6) {
    insights.push('Your average negotiation length is efficient — you tend to reach outcomes quickly.');
  } else if (metrics.averageRounds > 8) {
    insights.push('Your negotiations tend to run long. Consider more decisive initial offers.');
  }

  // Concession consistency
  if (metrics.concessionStats.averagePercentage > 0 && metrics.concessionStats.averagePercentage < 10) {
    insights.push('Your concession percentage is well-controlled and consistent.');
  } else if (metrics.concessionStats.averagePercentage >= 15) {
    insights.push('You tend to concede significantly. Try holding firmer initial positions.');
  }

  // Success rate
  if (metrics.successRate >= 80) {
    insights.push(`Excellent success rate of ${metrics.successRate}% — you consistently reach agreements.`);
  } else if (metrics.successRate < 50) {
    insights.push(`Your success rate is ${metrics.successRate}%. Focus on finding zones of agreement.`);
  }

  return insights;
}

module.exports = {
  calculateSessionScore,
  calculatePerformance,
  calculateScoreTrend,
  calculateConcessionStats,
  calculatePerformanceTrend,
  calculateScenarioStats,
  generateInsights,
};
