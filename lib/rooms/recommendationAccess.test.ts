import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recommendationRoomsForViewer } from "./recommendationAccess";

const publicRooms = [{ id: "room-a", house_number: "257/..", price: 6_000_000 }, { id: "room-b", house_number: "..", price: 7_000_000 }];

function clients(level: number | null, userId: string | null = "verified-user", authError = false, addressError = false) {
  const lookups: { table: string; columns: string; userId?: string; ids?: string[] }[] = [];
  const viewer = { auth: { getUser: async () => ({ data: { user: userId ? { id: userId, user_metadata: { adminLevel: 1 } } : null }, error: authError ? new Error("invalid session") : null }) } } as unknown as SupabaseClient;
  const server = { from: (table: string) => ({ select: (columns: string) => ({
    eq: (_key: string, id: string) => ({ maybeSingle: async () => {
      lookups.push({ table, columns, userId: id }); return { data: level === null ? null : { level }, error: null };
    } }),
    in: async (_key: string, ids: string[]) => {
      lookups.push({ table, columns, ids });
      return { data: [{ id: "room-a", house_number: "257/17" }, { id: "room-b", house_number: "88B" }, { id: "unrequested", house_number: "SECRET" }], error: addressError ? new Error("database error") : null };
    },
  }) }) } as unknown as SupabaseClient;
  return { viewer, server, lookups };
}

test("anon and invalid sessions keep masked numbers without querying rooms", async () => {
  for (const args of [[null, null, false], [1, "verified-user", true]] as const) {
    const c = clients(args[0], args[1], args[2]);
    assert.deepEqual(await recommendationRoomsForViewer(publicRooms, c.viewer, c.server), publicRooms);
    assert.equal(c.lookups.length, 0);
  }
});
test("regular signed-in users and forged user_metadata do not reveal full numbers", async () => {
  for (const level of [null, 0, 3, 999]) {
    const c = clients(level);
    assert.deepEqual(await recommendationRoomsForViewer(publicRooms, c.viewer, c.server), publicRooms);
    assert.equal(c.lookups.some(q => q.table === "rooms"), false);
  }
});
test("both L1 and L2 receive full house numbers in one bounded batch", async () => {
  for (const level of [1, 2]) {
    const c = clients(level);
    const result = await recommendationRoomsForViewer(publicRooms, c.viewer, c.server);
    assert.equal(result[0].house_number, "257/17"); assert.equal(result[1].house_number, "88B");
    assert.deepEqual(result.map(r => r.id), publicRooms.map(r => r.id));
    assert.deepEqual(c.lookups, [
      { table: "admin_users", columns: "level", userId: "verified-user" },
      { table: "rooms", columns: "id,house_number", ids: ["room-a", "room-b"] },
    ]);
    assert.equal(publicRooms[0].house_number, "257/..");
  }
});
test("empty results do no auth work; address query failures never return raw data", async () => {
  const c = clients(1, "verified-user", false, true);
  assert.deepEqual(await recommendationRoomsForViewer([], c.viewer, c.server), []);
  assert.equal(c.lookups.length, 0);
  await assert.rejects(() => recommendationRoomsForViewer(publicRooms, c.viewer, c.server), /Cannot load/);
});
