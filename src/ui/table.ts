import Table from "cli-table3";

export function renderTable(head: string[], rows: Array<Array<string | number>>): string {
  const table = new Table({
    head,
    style: { head: ["cyan"], border: ["grey"] },
  });
  for (const row of rows) table.push(row.map(String));
  return table.toString();
}

export function renderKeyValueTable(entries: Array<[string, string | number]>): string {
  const table = new Table({ style: { border: ["grey"] } });
  for (const [key, value] of entries) table.push([key, String(value)]);
  return table.toString();
}
