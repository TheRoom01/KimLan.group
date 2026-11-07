export const MAX_READER_IMPORT_ISSUES = 100;
export const READER_PENDING_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export const MAX_READER_SOURCE_TEXT = 4000;

export type ReaderIssueSource = {
  text: string;
  kind: "message" | "import";
  address?: string;
  truncated?: boolean;
};

export type ReaderImportIssue = {
  kind: "failed" | "partial";
  codes: string[];
  sourceMessageId?: string;
  pendingIds?: string[];
  source?: ReaderIssueSource;
};

export function cleanReaderImportIssues(value: unknown): ReaderImportIssue[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_READER_IMPORT_ISSUES).flatMap((row) => {
    if (row?.kind !== "failed" && row?.kind !== "partial") return [];
    const codes = Array.isArray(row.codes) ? [...new Set<string>(
      row.codes.slice(0, 8).filter((code: unknown): code is string =>
        typeof code === "string" && /^[A-Z0-9][A-Z0-9_]{1,79}$/.test(code)),
    )] : [];
    const issue: ReaderImportIssue = { kind: row.kind, codes: codes.length ? codes : ["IMPORT_FAILED"] };
    if (typeof row.sourceMessageId === "string" && /^[A-Za-z0-9:_-]{1,128}$/.test(row.sourceMessageId)) {
      issue.sourceMessageId = row.sourceMessageId;
    }
    if (Array.isArray(row.pendingIds)) {
      const ids = [...new Set<string>(row.pendingIds.slice(0, 5).filter((id: unknown): id is string =>
        typeof id === "string" && READER_PENDING_ID.test(id)))];
      if (ids.length) issue.pendingIds = ids;
    }
    if (row.kind === "failed" && issue.sourceMessageId && typeof row.source?.text === "string"
      && row.source.text.trim() && (row.source.kind === "message" || row.source.kind === "import")) {
      const text = row.source.text.replaceAll("\0", "");
      issue.source = { text: text.slice(0, MAX_READER_SOURCE_TEXT).replace(/[\uD800-\uDBFF]$/, ""), kind: row.source.kind };
      if (text.length > MAX_READER_SOURCE_TEXT || row.source.truncated === true) issue.source.truncated = true;
      if (typeof row.source.address === "string" && row.source.address.trim()) {
        issue.source.address = row.source.address.replaceAll("\0", "").slice(0, 300).replace(/[\uD800-\uDBFF]$/, "");
      }
    }
    return [issue];
  });
}
