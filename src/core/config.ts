import fs from "node:fs";
import path from "node:path";
import { CONFIG_PATH, TOOLKIT_DIR } from "./paths.js";

export interface ToolkitConfig {
  /** Schema version, bumped when defaults/shape change so we can migrate old files. */
  version: number;
  theme: "gradient" | "plain";
  claudeProjectsDir: string;
  gitRepos: string[];
  burnout: {
    dailyHourWarning: number;
    weeklyHourWarning: number;
    lateNightHour: number; // 0-23, sessions starting at/after this hour count as "late"
  };
  alerts: {
    streakRiskHours: number; // warn when a streak is about to lapse within N hours
  };
  reports: {
    outputDir: string;
    defaultFormat: "markdown" | "html" | "terminal";
  };
  plugins: {
    enabled: string[];
  };
  ingest: {
    /** Only ingest transcripts modified within the last N days (0 = no limit). */
    maxAgeDays: number;
  };
  /** Additional ~/.claude installs to aggregate into this same database,
   * each tagged with a name — see analytics/team.ts and the "Team Activity"
   * menu screen. Local-only: no network calls, just extra directories read
   * on `sync`, the same way claudeProjectsDir is. */
  team: {
    members: Array<{ name: string; claudeProjectsDir: string }>;
  };
  goals: {
    /** 0 disables the goal. */
    weeklyHoursTarget: number;
    streakTargetDays: number;
  };
}

export const DEFAULT_CONFIG: ToolkitConfig = {
  version: 1,
  theme: "gradient",
  claudeProjectsDir: "",
  gitRepos: [],
  burnout: {
    dailyHourWarning: 8,
    weeklyHourWarning: 45,
    lateNightHour: 23,
  },
  alerts: {
    streakRiskHours: 20,
  },
  reports: {
    outputDir: "",
    defaultFormat: "markdown",
  },
  plugins: {
    enabled: [],
  },
  ingest: {
    maxAgeDays: 0,
  },
  team: {
    members: [],
  },
  goals: {
    weeklyHoursTarget: 0,
    streakTargetDays: 0,
  },
};

function deepMerge<T>(base: T, patch: Partial<T>): T {
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...base };
  for (const key of Object.keys(patch as any)) {
    const value = (patch as any)[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = deepMerge((base as any)[key] ?? {}, value);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

/** Type guard that lets a config file be partially valid (older shape
 * missing newly-added keys) without crashing later code that assumes the
 * full schema. Coerces known bad values to safe defaults rather than
 * throwing, so a hand-edited config doesn't take the whole CLI down.
 * Exported for unit testing — not part of the public API. */
export function sanitize(raw: Partial<ToolkitConfig>): Partial<ToolkitConfig> {
  const cleaned: Partial<ToolkitConfig> = { ...raw };
  if (cleaned.theme && cleaned.theme !== "gradient" && cleaned.theme !== "plain") {
    cleaned.theme = DEFAULT_CONFIG.theme;
  }
  if (typeof cleaned.claudeProjectsDir !== "string") {
    cleaned.claudeProjectsDir = DEFAULT_CONFIG.claudeProjectsDir;
  }
  if (!Array.isArray(cleaned.gitRepos)) {
    cleaned.gitRepos = DEFAULT_CONFIG.gitRepos;
  } else {
    cleaned.gitRepos = cleaned.gitRepos.filter((p): p is string => typeof p === "string");
  }
  if (typeof cleaned.burnout === "object" && cleaned.burnout !== null) {
    const b: any = cleaned.burnout;
    if (typeof b.dailyHourWarning !== "number" || !Number.isFinite(b.dailyHourWarning) || b.dailyHourWarning < 0) {
      b.dailyHourWarning = DEFAULT_CONFIG.burnout.dailyHourWarning;
    }
    if (typeof b.weeklyHourWarning !== "number" || !Number.isFinite(b.weeklyHourWarning) || b.weeklyHourWarning < 0) {
      b.weeklyHourWarning = DEFAULT_CONFIG.burnout.weeklyHourWarning;
    }
    if (
      typeof b.lateNightHour !== "number" ||
      !Number.isFinite(b.lateNightHour) ||
      b.lateNightHour < 0 ||
      b.lateNightHour > 23
    ) {
      b.lateNightHour = DEFAULT_CONFIG.burnout.lateNightHour;
    }
  }
  if (typeof cleaned.ingest === "object" && cleaned.ingest !== null) {
    const ing: any = cleaned.ingest;
    if (typeof ing.maxAgeDays !== "number" || !Number.isFinite(ing.maxAgeDays) || ing.maxAgeDays < 0) {
      ing.maxAgeDays = DEFAULT_CONFIG.ingest.maxAgeDays;
    }
  }
  if (typeof cleaned.alerts === "object" && cleaned.alerts !== null) {
    const a: any = cleaned.alerts;
    if (typeof a.streakRiskHours !== "number" || !Number.isFinite(a.streakRiskHours) || a.streakRiskHours < 0) {
      a.streakRiskHours = DEFAULT_CONFIG.alerts.streakRiskHours;
    }
  }
  if (typeof cleaned.goals === "object" && cleaned.goals !== null) {
    const g: any = cleaned.goals;
    if (typeof g.weeklyHoursTarget !== "number" || !Number.isFinite(g.weeklyHoursTarget) || g.weeklyHoursTarget < 0) {
      g.weeklyHoursTarget = DEFAULT_CONFIG.goals.weeklyHoursTarget;
    }
    if (typeof g.streakTargetDays !== "number" || !Number.isFinite(g.streakTargetDays) || g.streakTargetDays < 0) {
      g.streakTargetDays = DEFAULT_CONFIG.goals.streakTargetDays;
    }
  }
  return cleaned;
}

let cached: ToolkitConfig | null = null;

export function loadConfig(): ToolkitConfig {
  if (cached) return cached;

  if (!fs.existsSync(CONFIG_PATH)) {
    cached = { ...DEFAULT_CONFIG };
    return cached;
  }

  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<ToolkitConfig>;
    cached = deepMerge(DEFAULT_CONFIG, sanitize(parsed));
    return cached;
  } catch (err) {
    throw new Error(
      `Could not parse config at ${CONFIG_PATH}: ${(err as Error).message}. ` +
        `Fix or delete the file and it will be recreated with defaults.`
    );
  }
}

export function saveConfig(config: ToolkitConfig): void {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
  cached = config;
}

export function updateConfig(patch: Partial<ToolkitConfig>): ToolkitConfig {
  const next = deepMerge(loadConfig(), patch);
  saveConfig(next);
  return next;
}

export function ensureToolkitDir(): void {
  fs.mkdirSync(TOOLKIT_DIR, { recursive: true });
}

/** Test-only escape hatch: forces the next loadConfig() to re-read from disk. */
export function resetConfigCache(): void {
  cached = null;
}
