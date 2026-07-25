import inquirer from "inquirer";

type SeparatorInstance = InstanceType<typeof inquirer.Separator>;

export interface MenuChoice<T extends string> {
  name: string;
  value: T;
  disabled?: string | boolean;
}

export async function selectMenu<T extends string>(
  message: string,
  choices: Array<MenuChoice<T> | SeparatorInstance>
): Promise<T> {
  const { choice } = await inquirer.prompt<{ choice: T }>([
    {
      type: "list",
      name: "choice",
      message,
      choices,
      pageSize: 20,
      loop: false,
    },
  ]);
  return choice;
}

export async function confirm(message: string, defaultValue = true): Promise<boolean> {
  const { value } = await inquirer.prompt<{ value: boolean }>([
    { type: "confirm", name: "value", message, default: defaultValue },
  ]);
  return value;
}

export async function input(message: string, defaultValue?: string): Promise<string> {
  const { value } = await inquirer.prompt<{ value: string }>([
    { type: "input", name: "value", message, default: defaultValue },
  ]);
  return value;
}

export const Separator = inquirer.Separator;
