import { parseProfileUrl } from "./profile-url.js";

/** Limits for one import. */
export const LEAD_IMPORT = {
  maxLeads: 10_000,
  maxBytes: 5 * 1024 * 1024,
  maxExtraColumns: 20,
  maxFieldLength: 300,
} as const;

export const LEAD_FIELDS = ["url", "firstName", "lastName", "fullName", "company", "title", "location"] as const;
export type LeadField = (typeof LEAD_FIELDS)[number];
/** Which CSV column (by index) feeds each lead field. */
export type ColumnMapping = Partial<Record<LeadField, number>>;

export interface LeadInput {
  profileUrl: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  title: string | null;
  location: string | null;
  /** Other CSV columns, kept for message personalisation later. */
  extra: Record<string, string>;
}

export interface InvalidRow {
  /** 1-based line/row number as the person sees it in their file. */
  row: number;
  value: string;
  reason: string;
}

export interface LeadParseResult {
  leads: LeadInput[];
  invalid: InvalidRow[];
  /** Rows whose profile was already earlier in the same input. */
  duplicates: number;
  /** Leads beyond the import limit, not included. */
  overLimit: number;
  headers: string[];
  mapping: ColumnMapping;
  /** Up to 3 data rows, for showing what each column holds. */
  sample: string[][];
}

// ---------------------------------------------------------------- CSV

/** RFC 4180 CSV: quoted fields, "" escapes, CRLF/LF, BOM. Delimiter auto-detected (, ; tab). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.search(/\r?\n/) === -1 ? src.length : src.search(/\r?\n/));
  const counts = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length] as const);
  const delim = counts.sort((a, b) => b[1] - a[1])[0]![0];

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

// ---------------------------------------------------------------- columns

const key = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

const ALIASES: Record<LeadField, string[]> = {
  url: [
    "linkedinurl", "linkedinprofileurl", "linkedinprofile", "personlinkedinurl", "profileurl", "linkedin",
    "linkedinlink", "url", "profile", "profilelink", "publicprofileurl", "linkedinprofilelink",
  ],
  firstName: ["firstname", "first", "givenname", "fname"],
  lastName: ["lastname", "last", "surname", "familyname", "lname"],
  fullName: ["fullname", "name", "contactname", "personname", "leadname"],
  company: ["company", "companyname", "organization", "organisation", "currentcompany", "account", "accountname", "employer"],
  title: ["title", "jobtitle", "position", "headline", "role", "designation", "currenttitle"],
  location: ["location", "city", "region", "country", "personlocation"],
};

/** Guess which column holds what, from header names (then cell contents for the URL). */
export function detectColumns(headers: string[], sample: string[][] = []): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<number>();
  const keys = headers.map(key);
  for (const field of LEAD_FIELDS) {
    for (const alias of ALIASES[field]) {
      const i = keys.findIndex((k, idx) => k === alias && !used.has(idx));
      if (i !== -1) {
        mapping[field] = i;
        used.add(i);
        break;
      }
    }
  }
  // The profile column must actually hold profile links; otherwise find the column that does.
  const holdsProfiles = (i: number) => sample.some((r) => r[i] && parseProfileUrl(r[i]!).ok);
  if (sample.length && (mapping.url === undefined || !holdsProfiles(mapping.url))) {
    const found = headers.findIndex((_, i) => holdsProfiles(i));
    if (found !== -1) {
      if (mapping.url !== undefined) used.delete(mapping.url);
      for (const f of LEAD_FIELDS) if (mapping[f] === found) delete mapping[f];
      mapping.url = found;
      used.add(found);
    }
  }
  return mapping;
}

/** A CSV with no header row: first row already contains a profile link. */
function looksHeaderless(first: string[]): boolean {
  return first.some((c) => parseProfileUrl(c).ok);
}

// ---------------------------------------------------------------- import

const clean = (v: string | undefined) => {
  const s = (v ?? "").replace(/\s+/g, " ").trim().slice(0, LEAD_IMPORT.maxFieldLength);
  return s === "" ? null : s;
};

export function splitName(full: string | null): [string | null, string | null] {
  if (!full) return [null, null];
  const parts = full.split(" ");
  return [parts[0] ?? null, parts.length > 1 ? parts.slice(1).join(" ") : null];
}

class Collector {
  readonly leads: LeadInput[] = [];
  readonly invalid: InvalidRow[] = [];
  duplicates = 0;
  overLimit = 0;
  private seen = new Set<string>();

  add(row: number, rawUrl: string, fields: Omit<LeadInput, "profileUrl">): void {
    const parsed = parseProfileUrl(rawUrl);
    if (!parsed.ok) {
      this.invalid.push({ row, value: rawUrl.slice(0, 120), reason: rawUrl.trim() ? parsed.reason : "No LinkedIn link" });
      return;
    }
    if (this.seen.has(parsed.url)) {
      this.duplicates++;
      return;
    }
    this.seen.add(parsed.url);
    if (this.leads.length >= LEAD_IMPORT.maxLeads) {
      this.overLimit++;
      return;
    }
    this.leads.push({ profileUrl: parsed.url, ...fields });
  }
}

const EMPTY = { firstName: null, lastName: null, company: null, title: null, location: null, extra: {} };

/** CSV file → leads. `mapping` overrides the detected columns. */
export function leadsFromCsv(text: string, mapping?: ColumnMapping): LeadParseResult {
  const rows = parseCsv(text);
  if (rows.length === 0) return { leads: [], invalid: [], duplicates: 0, overLimit: 0, headers: [], mapping: {}, sample: [] };

  const headerless = looksHeaderless(rows[0]!);
  const width = Math.max(...rows.slice(0, 50).map((r) => r.length));
  const headers = headerless ? Array.from({ length: width }, (_, i) => `Column ${i + 1}`) : rows[0]!.map((h, i) => h.trim() || `Column ${i + 1}`);
  const data = headerless ? rows : rows.slice(1);
  const sample = data.slice(0, 3);
  const map = mapping ?? detectColumns(headers, data.slice(0, 20));
  const mapped = new Set(Object.values(map));
  const extraCols = headers
    .map((h, i) => [h, i] as const)
    .filter(([, i]) => !mapped.has(i))
    .slice(0, LEAD_IMPORT.maxExtraColumns);

  const out = new Collector();
  data.forEach((r, idx) => {
    const rowNo = idx + (headerless ? 1 : 2);
    const at = (f: LeadField) => (map[f] === undefined ? undefined : r[map[f]!]);
    const [fFirst, fLast] = splitName(clean(at("fullName")));
    const extra: Record<string, string> = {};
    for (const [h, i] of extraCols) {
      const v = clean(r[i]);
      if (v) extra[h] = v;
    }
    out.add(rowNo, map.url === undefined ? "" : (r[map.url] ?? ""), {
      firstName: clean(at("firstName")) ?? fFirst,
      lastName: clean(at("lastName")) ?? fLast,
      company: clean(at("company")),
      title: clean(at("title")),
      location: clean(at("location")),
      extra,
    });
  });
  return { leads: out.leads, invalid: out.invalid, duplicates: out.duplicates, overLimit: out.overLimit, headers, mapping: map, sample };
}

const LINK = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?(?:www\.)?linkedin\.com\/[^\s,;"'<>|]+/gi;

/** Pasted text → leads: every LinkedIn link on every line. */
export function leadsFromText(text: string): LeadParseResult {
  const out = new Collector();
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const links = line.match(LINK);
    if (!links) {
      out.invalid.push({ row: i + 1, value: line.trim().slice(0, 120), reason: "No LinkedIn link" });
      return;
    }
    for (const l of links) out.add(i + 1, l, { ...EMPTY, extra: {} });
  });
  return { leads: out.leads, invalid: out.invalid, duplicates: out.duplicates, overLimit: out.overLimit, headers: [], mapping: {}, sample: [] };
}
