import type { SessionRecord } from "../types/domain.js";
import type { SessionStats } from "./session-stats.js";
import type { ToolUsageStats } from "./tool-usage.js";
import type { StreakStats } from "./streaks.js";
import type { BurnoutReport } from "./burnout.js";
import { computeCurrentStreak } from "./forecast.js";
import { clamp } from "../utils/numbers.js";

export type ArchetypeCategory = "professional" | "technical" | "fun" | "premium";

/** Consolidates: cc-personality, cc-score, cc-achievements. A lightweight,
 * gamified summary layer on top of the other analytics modules — no new
 * data collection, just a fun composite view. */
export interface PersonalitySummary {
  archetype: string;
  archetypeTagline: string;
  archetypeDescription: string;
  archetypeCategory: ArchetypeCategory;
  runnerUp: { archetype: string; category: ArchetypeCategory } | null;
  productivityScore: number; // 0-100
  scoreBreakdown: Record<string, number>;
  insights: string[];
  achievements: Achievement[];
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
}

export interface PersonalityInputs {
  sessions: SessionRecord[];
  sessionStats: SessionStats;
  toolUsage: ToolUsageStats;
  streaks: StreakStats;
  burnout: BurnoutReport;
}

interface ArchetypeDef {
  id: string;
  tagline: string;
  description: string;
  category: ArchetypeCategory;
  score: (i: PersonalityInputs) => number;
}

/** Each archetype scores itself 0-100 on fit; the highest score wins. This
 * replaces a brittle first-match boolean list with something that degrades
 * gracefully — a profile can be "close" to several archetypes and still
 * land on the best one instead of whichever happened to be listed first. */
const ARCHETYPES: ArchetypeDef[] = [
  // ── Professional ──────────────────────────────────────────────
  {
    id: "The Architect",
    tagline: "Measures twice, ships once.",
    description:
      "Plans before building. Long, deliberate sessions with a high turn count and a clean error record suggest someone who thinks through the shape of a problem before touching the keyboard.",
    category: "professional",
    score: (i) =>
      clamp((0.08 - i.streaks.errorRate) / 0.08, 0, 1) * 50 +
      clamp(i.sessionStats.avgTurnsPerSession / 25, 0, 1) * 50,
  },
  {
    id: "The Systems Engineer",
    tagline: "Automates the boring parts, then automates that too.",
    description:
      "Heavy on shell commands relative to search, wide tool coverage, and a low error rate — the profile of someone building infrastructure and tooling rather than one-off scripts.",
    category: "professional",
    score: (i) =>
      clamp(i.toolUsage.ratios.bashToGrep / 5, 0, 1) * 35 +
      clamp(i.toolUsage.avgDistinctToolsPerSession / 10, 0, 1) * 35 +
      clamp((0.05 - i.streaks.errorRate) / 0.05, 0, 1) * 30,
  },
  {
    id: "The Project Lead",
    tagline: "Shows up every day, ships every week.",
    description:
      "A high session count spread evenly across the week, rather than clustered into occasional binges — the rhythm of someone treating this as a steady, ongoing responsibility.",
    category: "professional",
    score: (i) => {
      const hours = i.sessionStats.byWeekday.map((d) => d.hours);
      const spread = hours.length ? weekdaySpreadScore(hours) : 0;
      return (
        clamp(i.sessionStats.totalSessions / 150, 0, 1) * 40 +
        spread * 30 +
        clamp((0.1 - i.streaks.errorRate) / 0.1, 0, 1) * 30
      );
    },
  },
  {
    id: "The Specialist",
    tagline: "One toolbox, mastered completely.",
    description:
      "A narrow, repeated set of tools used at very high volume — not because of unfamiliarity with the rest, but because a small, well-worn kit gets the job done.",
    category: "professional",
    score: (i) =>
      clamp((5 - i.toolUsage.avgDistinctToolsPerSession) / 5, 0, 1) * 50 +
      clamp(i.toolUsage.totalCalls / 2000, 0, 1) * 50,
  },
  {
    id: "The Closer",
    tagline: "In, done, out — no wasted motion.",
    description:
      "Short, decisive sessions with a strong self-recovery rate: problems get fixed the moment they appear, and sessions end because the work is done, not because time ran out.",
    category: "professional",
    score: (i) =>
      i.streaks.selfRecoveryRate * 40 +
      clamp((0.05 - i.streaks.errorRate) / 0.05, 0, 1) * 30 +
      clamp((30 - i.sessionStats.medianSessionMinutes) / 30, 0, 1) * 30,
  },

  // ── Technical ──────────────────────────────────────────────────
  {
    id: "The Debugger",
    tagline: "Breaks things on purpose, fixes them on instinct.",
    description:
      "An elevated error rate paired with a very high self-recovery rate — this isn't carelessness, it's someone who moves fast, hits the wall, and is back on track within a call or two.",
    category: "technical",
    score: (i) => clamp(i.streaks.errorRate / 0.15, 0, 1) * 50 + i.streaks.selfRecoveryRate * 50,
  },
  {
    id: "The Refactorer",
    tagline: "Leaves every file better than it found it.",
    description:
      "Heavy read-before-write habits and a healthy write-to-edit ratio point to someone reshaping existing code deliberately, not just bolting features onto it.",
    category: "technical",
    score: (i) =>
      clamp(i.toolUsage.ratios.writeToEdit / 1.5, 0, 1) * 40 +
      clamp(i.toolUsage.ratios.readToEdit / 3, 0, 1) * 40 +
      clamp(i.sessionStats.avgTurnsPerSession / 20, 0, 1) * 20,
  },
  {
    id: "The Automator",
    tagline: "If it happens twice, it becomes a script.",
    description:
      "A strong lean toward shell commands over manual search, combined with a high fire-and-forget rate — work gets delegated and left to run, not babysat.",
    category: "technical",
    score: (i) => clamp(i.toolUsage.ratios.bashToGrep / 8, 0, 1) * 50 + i.sessionStats.fireAndForgetRate * 50,
  },
  {
    id: "The Explorer",
    tagline: "Reads first, asks questions never.",
    description:
      "A wide, varied tool palette and a strong read-to-edit ratio — the signature of someone who maps out unfamiliar territory thoroughly before making a move.",
    category: "technical",
    score: (i) =>
      clamp(i.toolUsage.avgDistinctToolsPerSession / 12, 0, 1) * 50 +
      clamp(i.toolUsage.ratios.readToEdit / 4, 0, 1) * 50,
  },
  {
    id: "The Perfectionist",
    tagline: "Ships when it's right, not when it's done.",
    description:
      "An exceptionally low error rate combined with a high turn count — extra care and extra iteration, trading raw speed for near-zero friction.",
    category: "technical",
    score: (i) =>
      clamp((0.02 - i.streaks.errorRate) / 0.02, 0, 1) * 60 +
      clamp(i.sessionStats.avgTurnsPerSession / 25, 0, 1) * 40,
  },

  // ── Fun ────────────────────────────────────────────────────────
  {
    id: "The Night Owl",
    tagline: "Does their best work after the sun sets.",
    description:
      "A large share of sessions kick off late at night — whether that's peak focus or just when the house finally goes quiet, the data doesn't judge.",
    category: "fun",
    score: (i) => i.burnout.lateNightSessionRate * 100,
  },
  {
    id: "The Sprinter",
    tagline: "In and out before the coffee gets cold.",
    description:
      "Short, frequent, high-intensity sessions — quick hits of focused work rather than long sit-down blocks.",
    category: "fun",
    score: (i) =>
      clamp((20 - i.sessionStats.medianSessionMinutes) / 20, 0, 1) * 50 +
      clamp(i.sessionStats.totalSessions / 60, 0, 1) * 50,
  },
  {
    id: "The Marathoner",
    tagline: "Once in, there's no getting out.",
    description:
      "Long, deep, immersive sessions that stretch well past the point most people would take a break — full immersion is the whole point.",
    category: "fun",
    score: (i) => clamp(i.sessionStats.medianSessionMinutes / 150, 0, 1) * 100,
  },
  {
    id: "The Fire-and-Forgetter",
    tagline: "Delegates it, walks away, comes back to a finished job.",
    description:
      "A high rate of sessions with minimal check-ins — the task gets handed off and left to run autonomously more often than most.",
    category: "fun",
    score: (i) => i.sessionStats.fireAndForgetRate * 100,
  },
  {
    id: "The Weekend Warrior",
    tagline: "Weekdays are for meetings, weekends are for building.",
    description:
      "A disproportionate share of total hours land on Saturday and Sunday — the real work happens when the calendar clears.",
    category: "fun",
    score: (i) => {
      const weekend = (i.sessionStats.byWeekday[0]?.hours ?? 0) + (i.sessionStats.byWeekday[6]?.hours ?? 0);
      const total = i.sessionStats.totalHours;
      return total > 0 ? clamp(weekend / total, 0, 1) * 100 : 0;
    },
  },
  {
    id: "The Comeback Kid",
    tagline: "Every setback becomes momentum.",
    description:
      "Real errors show up, but so does real recovery — and the weekly trend line is climbing. Setbacks here are a setup, not a slowdown.",
    category: "fun",
    score: (i) =>
      (i.burnout.momentumTrend === "accelerating" ? 40 : 0) +
      i.streaks.selfRecoveryRate * 40 +
      clamp(i.streaks.errorRate / 0.08, 0, 1) * 20,
  },
  {
    id: "The Chaos Gremlin",
    tagline: "Breaks it, breaks it again, somehow ships anyway.",
    description:
      "An elevated error rate without the recovery instinct to match — a scrappy, trial-and-error style that gets there eventually, just not cleanly.",
    category: "fun",
    score: (i) => clamp(i.streaks.errorRate / 0.15, 0, 1) * 60 + clamp(1 - i.streaks.selfRecoveryRate, 0, 1) * 40,
  },
  {
    id: "The Speedrunner",
    tagline: "Every session is a personal-best attempt.",
    description:
      "An unusually high density of turns-per-minute — short sessions packed with rapid-fire exchanges, optimized for speed over deliberation.",
    category: "fun",
    score: (i) => {
      const density = i.sessionStats.avgTurnsPerSession / Math.max(i.sessionStats.medianSessionMinutes, 1);
      return clamp(density / 2, 0, 1) * 100;
    },
  },

  // ── Premium ────────────────────────────────────────────────────
  {
    id: "The Virtuoso",
    tagline: "Elite across every axis that matters.",
    description:
      "Low error rate, strong self-recovery, a broad tool vocabulary, and serious session volume — few profiles clear the bar on all four at once.",
    category: "premium",
    score: (i) =>
      clamp((0.03 - i.streaks.errorRate) / 0.03, 0, 1) * 25 +
      i.streaks.selfRecoveryRate * 25 +
      clamp(i.toolUsage.avgDistinctToolsPerSession / 10, 0, 1) * 25 +
      clamp(i.sessionStats.totalSessions / 100, 0, 1) * 25,
  },
  {
    id: "The Grandmaster",
    tagline: "Hundreds of sessions in, still steady.",
    description:
      "A deep session history with well-managed burnout risk and momentum that isn't fading — the mark of someone who's built this into a sustainable practice, not a sprint.",
    category: "premium",
    score: (i) =>
      clamp(i.sessionStats.totalSessions / 200, 0, 1) * 50 +
      clamp((60 - i.burnout.score) / 60, 0, 1) * 30 +
      (i.burnout.momentumTrend !== "declining" ? 20 : 0),
  },
  {
    id: "The Luminary",
    tagline: "Rising output, falling risk — the good kind of trend.",
    description:
      "Weekly momentum is accelerating while burnout risk stays low and total hours climb — output going up without the wear-and-tear usually going up with it.",
    category: "premium",
    score: (i) =>
      (i.burnout.momentumTrend === "accelerating" ? 40 : 0) +
      clamp((50 - i.burnout.score) / 50, 0, 1) * 30 +
      clamp(i.sessionStats.totalHours / 300, 0, 1) * 30,
  },
  {
    id: "The Vanguard",
    tagline: "Sets the pace everyone else catches up to.",
    description:
      "Accelerating weekly momentum on top of an already substantial session history — the trajectory of someone pulling further ahead, not just keeping up.",
    category: "premium",
    score: (i) =>
      (i.burnout.momentumTrend === "accelerating" ? 60 : 0) + clamp(i.sessionStats.totalSessions / 120, 0, 1) * 40,
  },
];

const GENERALIST: ArchetypeDef = {
  id: "The Generalist",
  tagline: "Doesn't lean hard into any one extreme — and that's the strength.",
  description:
    "A balanced, adaptable working style: no dominant quirk in error rate, session length, or tool mix. Comfortable moving between modes as the work demands it.",
  category: "professional",
  score: () => 34,
};

export function computePersonalitySummary(inputs: PersonalityInputs): PersonalitySummary {
  const ranked = [...ARCHETYPES, GENERALIST]
    .map((a) => ({ def: a, score: a.score(inputs) }))
    .sort((a, b) => b.score - a.score);

  const winner = ranked[0]!.def;
  const runnerUpEntry = ranked[1];
  const runnerUp =
    runnerUpEntry && runnerUpEntry.score > 0
      ? { archetype: runnerUpEntry.def.id, category: runnerUpEntry.def.category }
      : null;

  const scoreBreakdown = {
    consistency: clampScore(25 - inputs.streaks.errorRate * 100),
    reliability: clampScore(inputs.streaks.selfRecoveryRate * 25),
    momentum: clampScore(inputs.burnout.momentumTrend === "declining" ? 10 : 25),
    balance: clampScore(25 - inputs.burnout.score * 0.25),
  };
  const productivityScore = Math.round(
    Object.values(scoreBreakdown).reduce((sum, v) => sum + v, 0)
  );

  return {
    archetype: winner.id,
    archetypeTagline: winner.tagline,
    archetypeDescription: winner.description,
    archetypeCategory: winner.category,
    runnerUp,
    productivityScore,
    scoreBreakdown,
    insights: computeInsights(inputs),
    achievements: computeAchievements(inputs),
  };
}

function weekdaySpreadScore(hours: number[]): number {
  const total = hours.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  const mean = total / hours.length;
  const variance = hours.reduce((a, h) => a + (h - mean) ** 2, 0) / hours.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
  return clamp(1 - cv / 1.5, 0, 1);
}

function formatHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const period = h < 12 ? "am" : "pm";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${period}`;
}

/** Data-driven, narrative bullet points — always includes a few baseline
 * observations, then layers on conditional callouts only when the signal
 * is strong enough to be worth mentioning. */
export function computeInsights(inputs: PersonalityInputs): string[] {
  const insights: string[] = [];
  const { sessionStats, toolUsage, streaks, burnout } = inputs;

  if (burnout.bestWindow) {
    insights.push(
      `Your most productive window is ${formatHour(burnout.bestWindow.startHour)}–${formatHour(
        burnout.bestWindow.endHour
      )} — that's when the most session hours land.`
    );
  }

  insights.push(
    `Typical session runs ${sessionStats.medianSessionMinutes.toFixed(0)}m across ${sessionStats.totalSessions} total sessions, averaging ${sessionStats.avgTurnsPerSession.toFixed(1)} turns each.`
  );

  insights.push(
    `Reaches for ${toolUsage.avgDistinctToolsPerSession.toFixed(1)} distinct tools per session on average — a ${
      toolUsage.avgDistinctToolsPerSession >= 8 ? "broad, exploratory" : toolUsage.avgDistinctToolsPerSession <= 4 ? "tight, focused" : "moderate"
    } toolkit style.`
  );

  if (toolUsage.totalCalls > 50) {
    if (streaks.errorRate < 0.02) {
      insights.push(
        `Runs remarkably clean — a ${(streaks.errorRate * 100).toFixed(2)}% error rate across ${toolUsage.totalCalls} tool calls puts this in elite territory.`
      );
    } else if (streaks.errorRate > 0.1) {
      insights.push(
        `Hits friction more than most (${(streaks.errorRate * 100).toFixed(1)}% error rate)${
          streaks.selfRecoveryRate > 0.6 ? ", but the recovery instinct is sharp — most errors are fixed within a few calls." : "."
        }`
      );
    }
  }

  if (burnout.lateNightSessionRate > 0.25) {
    insights.push(`${Math.round(burnout.lateNightSessionRate * 100)}% of sessions start late at night.`);
  }

  const weekendHours = (sessionStats.byWeekday[0]?.hours ?? 0) + (sessionStats.byWeekday[6]?.hours ?? 0);
  const weekendRatio = sessionStats.totalHours > 0 ? weekendHours / sessionStats.totalHours : 0;
  if (weekendRatio > 0.3) {
    insights.push(`${Math.round(weekendRatio * 100)}% of total hours fall on a weekend.`);
  }

  if (burnout.momentumTrend === "accelerating") {
    insights.push("Weekly momentum is trending up — recent weeks show more hours than earlier ones.");
  } else if (burnout.momentumTrend === "declining") {
    insights.push("Weekly momentum has cooled off compared to earlier weeks — could be a lull or a wind-down.");
  }

  if (streaks.longestStreak > 0) {
    insights.push(`Longest clean run: ${streaks.longestStreak} tool calls in a row without an error.`);
  }

  return insights;
}

function clampScore(v: number): number {
  return Math.round(Math.max(0, Math.min(25, v)));
}

function computeAchievements(inputs: PersonalityInputs): Achievement[] {
  const streak = computeCurrentStreak(inputs.sessions);
  const totalHours = inputs.sessionStats.totalHours;

  return [
    {
      id: "first-session",
      title: "First Contact",
      description: "Completed your first Claude Code session.",
      unlocked: inputs.sessionStats.totalSessions >= 1,
    },
    {
      id: "century",
      title: "Century Club",
      description: "Logged 100 sessions.",
      unlocked: inputs.sessionStats.totalSessions >= 100,
    },
    {
      id: "hundred-hours",
      title: "100 Hour Milestone",
      description: "Accumulated 100 hours of session time.",
      unlocked: totalHours >= 100,
    },
    {
      id: "week-streak",
      title: "Week Warrior",
      description: "7-day active streak.",
      unlocked: streak >= 7,
    },
    {
      id: "month-streak",
      title: "Unbroken",
      description: "30-day active streak.",
      unlocked: streak >= 30,
    },
    {
      id: "clean-runner",
      title: "Clean Runner",
      description: "Error rate under 2% across all recorded tool calls.",
      unlocked: inputs.toolUsage.totalCalls > 50 && inputs.streaks.errorRate < 0.02,
    },
    {
      id: "polyglot",
      title: "Tool Polyglot",
      description: "Averages 8+ distinct tools per session.",
      unlocked: inputs.toolUsage.avgDistinctToolsPerSession >= 8,
    },
  ];
}
