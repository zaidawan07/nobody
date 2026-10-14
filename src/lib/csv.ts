/**
 * Build a spreadsheet-safe CSV document.
 *
 * Prefixing formula-leading values prevents user-controlled CRM fields from
 * being interpreted as formulas when an export is opened in spreadsheet apps.
 */
function safeCell(value: unknown): string {
  let text = value == null ? "" : value instanceof Date ? value.toISOString() : String(value);
  if (/^\s*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: Array<{ key: keyof T; label: string }>): string {
  const header = columns.map((column) => safeCell(column.label)).join(",");
  const body = rows.map((row) => columns.map((column) => safeCell(row[column.key])).join(","));
  return "\uFEFF" + [header, ...body].join("\r\n") + "\r\n";
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
