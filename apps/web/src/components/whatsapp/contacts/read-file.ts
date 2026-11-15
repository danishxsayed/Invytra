import { WA_IMPORT, parseCsv, toCsv } from "@invytra/shared";

/*
 * A contacts file into rows of text, in the browser: CSV as is, Excel (.xlsx) through
 * exceljs (first sheet, loaded only when needed). Dates become "2026-10-12 11:00". The rows go to the
 * server as CSV text, so one import path serves both.
 */

export const ACCEPT = ".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const MAX_FILE_MB = 20;

const pad = (n: number) => String(n).padStart(2, "0");
const cellText = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    const t = v.getUTCHours() || v.getUTCMinutes() ? ` ${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}` : "";
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}${t}`;
  }
  if (typeof v === "number") return Number.isInteger(v) ? v.toFixed(0) : String(v);
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; result?: unknown; text?: unknown; error?: string };
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if ("result" in o) return cellText(o.result);
    if ("text" in o) return cellText(o.text);
    return "";
  }
  return String(v);
};

export async function readContactFile(file: File): Promise<{ rows: string[][]; csv: string } | { error: string }> {
  const name = file.name.toLowerCase();
  if (file.size > MAX_FILE_MB * 1024 * 1024) return { error: `That file is too big (up to ${MAX_FILE_MB} MB).` };
  let rows: string[][];
  if (name.endsWith(".xls")) return { error: "Old .xls files can't be read. Save it as .xlsx or .csv in Excel and try again." };
  if (name.endsWith(".xlsx")) {
    try {
      const { default: ExcelJS } = await import("exceljs");
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(await file.arrayBuffer());
      const sheet = book.worksheets[0];
      rows = [];
      sheet?.eachRow({ includeEmpty: true }, (row) => {
        const cells: string[] = [];
        for (let c = 1; c <= (sheet.columnCount || row.cellCount); c++) cells.push(cellText(row.getCell(c).value).trim());
        rows.push(cells);
      });
    } catch {
      return { error: "That Excel file couldn't be read. Save it again as .xlsx or .csv." };
    }
  } else rows = parseCsv(await file.text());
  const csv = toCsv(rows);
  if (csv.length > WA_IMPORT.maxBytes) return { error: `That's more than one import can take (about ${WA_IMPORT.maxRows.toLocaleString("en-US")} contacts). Split the file in two.` };
  return { rows, csv };
}
