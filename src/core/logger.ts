import chalk from "chalk";

export type LogLevel = "debug" | "info" | "warn" | "error";

let verbose = process.env.CC_ATLAS_VERBOSE === "1";

export function setVerbose(value: boolean): void {
  verbose = value;
}

export const logger = {
  debug(message: string): void {
    if (verbose) console.error(chalk.dim(`[debug] ${message}`));
  },
  info(message: string): void {
    console.error(chalk.cyan(message));
  },
  warn(message: string): void {
    console.error(chalk.yellow(`⚠ ${message}`));
  },
  error(message: string): void {
    console.error(chalk.red(`✖ ${message}`));
  },
};
