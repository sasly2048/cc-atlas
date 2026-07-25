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
    cached = deepMerge(DEFAULT_CONFIG, parsed);
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
