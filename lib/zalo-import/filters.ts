import { OFFICIAL_ZALO_GROUPS } from "../zalo-reader/official";
export function importFilters(input: Record<string, any>) {
  const group = String(input.group || ""); const type = String(input.type || "");
  if (group && !OFFICIAL_ZALO_GROUPS.some(item => item.name === group)) throw new Error("Invalid group filter");
  if (type && !["CREATE","UPDATE","NEEDS_REVIEW"].includes(type)) throw new Error("Invalid import type");
  const date = (value: any) => { if (!value) return ""; const time = Date.parse(value); if (!Number.isFinite(time)) throw new Error("Invalid date filter"); return new Date(time).toISOString(); };
  return { group, type, readFrom: date(input.readFrom), readTo: date(input.readTo) };
}
export function applyImportFilters(query: any, filters: ReturnType<typeof importFilters>) {
  if (filters.group) query = query.eq("batch.group_name", filters.group);
  if (filters.type) query = query.eq("room_payload->_room_import->>type", filters.type);
  if (filters.readFrom) query = query.gte("created_at", filters.readFrom);
  if (filters.readTo) query = query.lte("created_at", filters.readTo);
  return query;
}
