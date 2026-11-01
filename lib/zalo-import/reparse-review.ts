/** Only fields explicitly saved by the editor are protected, including explicit clears. */
export function preserveConfirmedFields(
  pending: any, parsed: { roomPayload: Record<string, any>; detailPayload: Record<string, any> },
  choices: Record<string, unknown> = {},
) {
  const conflicts: { key: string; previous: unknown; proposed: unknown }[] = [];
  const confirmed = pending.room_payload?._confirmed_fields || {};
  for (const [key, previous] of Object.entries(confirmed)) {
    const [scope, field] = key.split(".");
    if (!field || !["room", "detail"].includes(scope)) continue;
    const payload = scope === "room" ? parsed.roomPayload : parsed.detailPayload;
    const proposed = payload[field];
    if (JSON.stringify(previous) !== JSON.stringify(proposed) && choices[key] !== "source" && choices[key] !== "keep") {
      conflicts.push({ key, previous, proposed });
    }
    if (choices[key] !== "source") payload[field] = previous;
  }
  parsed.roomPayload._confirmed_fields = Object.fromEntries(Object.entries(confirmed).map(([key, value]) => {
    const [scope, field] = key.split(".");
    return [key, choices[key] === "source" ? (scope === "room" ? parsed.roomPayload : parsed.detailPayload)[field] : value];
  }));
  return conflicts;
}
