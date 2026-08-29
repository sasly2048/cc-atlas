import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let home: string;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "cc-atlas-cli-test-"));
  fs.mkdirSync(path.join(home, ".claude", "projects"), { recursive: true });
});

afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

const CLI_ENTRY = path.resolve(__dirname, "../../src/cli.ts");
const TSX_CLI = path.resolve(__dirname, "../../node_modules/tsx/dist/cli.mjs");

function runCli(args: string[]): { stdout: string; status: number } {
  // On Windows os.homedir() reads USERPROFILE before HOME, and on POSIX the
  // cc-atlas code paths also touch $HOME for the default projects directory.
  // Override both so the CLI can never accidentally read the real user's
  // ~/.claude (which is exactly what happened before this — sync ingested
  // 117 real files from the test runner's home and the "empty" test failed).
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CC_ATLAS_HOME: path.join(home, ".cc-atlas"),
    HOME: home,
    USERPROFILE: home,
    // Force-disable colored output to keep the stdout assertions stable
    // across TTY/no-TTY CI runs.
    NO_COLOR: "1",
    FORCE_COLOR: "0",
  };
  try {
    const stdout = execFileSync(process.execPath, [TSX_CLI, CLI_ENTRY, ...args], {
      env,
      encoding: "utf8",
    });
    return { stdout, status: 0 };
  } catch (err: any) {
    return { stdout: err.stdout?.toString() ?? "", status: err.status ?? 1 };
  }
}

describe("cc-atlas CLI", () => {
  it("prints help and lists all subcommands", () => {
    const { stdout, status } = runCli(["--help"]);
    expect(status).toBe(0);
    expect(stdout).toContain("sync");
    expect(stdout).toContain("doctor");
    expect(stdout).toContain("report");
    expect(stdout).toContain("alert");
    expect(stdout).toContain("badge");
  });

  it("prints the version", () => {
    const { stdout, status } = runCli(["--version"]);
    expect(status).toBe(0);
    expect(stdout.trim().length).toBeGreaterThan(0);
  });

  it("runs sync against an empty projects directory without crashing", () => {
    const { stdout, status } = runCli(["sync"]);
    expect(status).toBe(0);
    expect(stdout).toContain("0 file(s) ingested");
  });

  it("runs doctor and reports the missing git-repo check", () => {
    const { stdout, status } = runCli(["doctor"]);
    expect(status).toBe(0);
    expect(stdout).toContain("git repo configured");
  });

  it("alert exits 0 with no data recorded yet", () => {
    const { status } = runCli(["alert"]);
    expect(status).toBe(0);
  });

  it("export --format prometheus prints valid exposition text with no data", () => {
    const { stdout, status } = runCli(["export", "--format", "prometheus"]);
    expect(status).toBe(0);
    expect(stdout).toContain("# HELP cc_atlas_sessions_total");
    expect(stdout).toContain("cc_atlas_sessions_total 0");
  });

  it("export --format json prints parseable JSON with no data", () => {
    const { stdout, status } = runCli(["export", "--format", "json"]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.sessionStats.totalSessions).toBe(0);
  });

  it("ask answers with guidance when there's no data yet", () => {
    const { stdout, status } = runCli(["ask", "how many hours this week"]);
    expect(status).toBe(0);
    expect(stdout).toContain("hour");
  });

  it("status prints a compact status line", () => {
    const { stdout, status } = runCli(["status"]);
    expect(status).toBe(0);
    expect(stdout).toContain("d ·");
  });

  it("status --json prints a machine-readable snapshot", () => {
    const { stdout, status } = runCli(["status", "--json"]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty("streakDays");
    expect(parsed).toHaveProperty("burnoutRisk");
  });
}, 30_000);
