export const MAX_SHARED_BUILDINGS = 30;

export function parseCollectionTokens(value: string | string[] | undefined): string[] {
  if (typeof value !== "string") return [];
  const tokens = [...new Set(value.split(","))];
  if (!tokens.length || tokens.length > MAX_SHARED_BUILDINGS || tokens.some((token) => !/^[A-Za-z0-9_-]{40,80}$/.test(token))) return [];
  return tokens;
}

export function collectionPath(tokens: string[]) {
  return `/sales?links=${encodeURIComponent(tokens.join(","))}`;
}

type SharedBuilding = { id: string; code: string | null; code_aliases?: string[] };

function urlBuildingCode(code: string | null | undefined) {
  return code?.trim().replace(/\//g, ".");
}

export function salesBuildingKey(property: SharedBuilding, properties: SharedBuilding[]) {
  const code = urlBuildingCode(property.code);
  if (!code) return property.id;
  const ambiguous = properties.some((other) => other.id !== property.id && (urlBuildingCode(other.code) === code || other.id === code));
  return ambiguous ? `${code}--${property.id}` : code;
}

export function findSalesBuilding(properties: SharedBuilding[], key: unknown) {
  if (typeof key !== "string" || !key) return undefined;
  // Keep previously shared UUID URLs working within the authorized collection.
  const current = properties.find((property) => property.id === key)
    ?? properties.find((property) => salesBuildingKey(property, properties) === key);
  if (current) return current;
  // Accept slash-based URLs as well as historical codes; the page redirects to the URL-only form.
  const aliases = properties.filter((property) => [property.code, ...(property.code_aliases ?? [])]
    .some((alias) => alias && (alias.trim() === key || `${alias.trim()}--${property.id}` === key)));
  return aliases.length === 1 ? aliases[0] : undefined;
}
