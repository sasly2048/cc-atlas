import ora, { type Ora } from "ora";

export async function withSpinner<T>(label: string, task: () => Promise<T> | T): Promise<T> {
  const spinner: Ora = ora(label).start();
  try {
    const result = await task();
    spinner.succeed(label);
    return result;
  } catch (err) {
    spinner.fail(`${label} failed`);
    throw err;
  }
}
