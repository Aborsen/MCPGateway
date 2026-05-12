export type CsvColumn<T> = {
  header: string;
  get: (row: T) => unknown;
};

export function rowsToCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const head = columns.map((c) => escapeCell(c.header)).join(",");
  const body = rows
    .map((row) => columns.map((c) => escapeCell(c.get(row))).join(","))
    .join("\r\n");
  return body.length > 0 ? `${head}\r\n${body}` : head;
}

function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (typeof v === "string") s = v;
  else if (typeof v === "number" || typeof v === "boolean") s = String(v);
  else s = JSON.stringify(v);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
