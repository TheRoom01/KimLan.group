export function parseAllowedGroupsJson(value: unknown): string[] | null {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  try {
    const parsed = JSON.parse(String(value));
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      return [];
    }

    return Array.from(new Set(parsed.map((item) => item.trim()).filter(Boolean)));
  } catch {
    return [];
  }
}

export function normalizeExactGroupName(value: unknown) {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("vi-VN");
}

export function isExactGroupNameMatch(actual: unknown, expected: unknown) {
  const actualName = normalizeExactGroupName(actual);
  const expectedName = normalizeExactGroupName(expected);
  return Boolean(actualName && expectedName && actualName === expectedName);
}
