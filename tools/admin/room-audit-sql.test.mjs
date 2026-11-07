import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { PGlite } = require(process.env.OFFLINE_SQL_RUNTIME ||
  path.resolve(".zalo-reader/offline-sql-runtime/node_modules/@electric-sql/pglite"));
const db = new PGlite();
const ids = Object.fromEntries(["admin", "otherAdmin", "staff", "owner", "manager", "property", "room", "archivedRoom", "purgedRoom", "media", "legacy", "mediaRoom", "retainedMedia"].map(key => [key, randomUUID()]));
const rows = async (query, args) => (await db.query(query, args)).rows;
const identity = async (id, role = "authenticated", headers = {}) => {
  await db.exec("reset role");
  await rows("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claims',$2,false), set_config('request.headers',$3,false)",
    [id, JSON.stringify({ role }), JSON.stringify(headers)]);
  if (["anon", "authenticated", "service_role"].includes(role)) await db.exec(`set role ${role}`);
};
const last = async () => {
  await db.exec("reset role");
  return (await rows("select * from public.room_audit_events order by created_at desc,id desc limit 1"))[0];
};

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    grant usage on schema auth to authenticated;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.admin_users(user_id uuid primary key,level int,full_name text);
    create function public.is_admin_l1() returns boolean language sql stable security definer as
      $$select exists(select 1 from public.admin_users where user_id=auth.uid() and level=1)$$;
    create function public.get_my_admin_level() returns integer language sql stable security definer as
      $$select level from public.admin_users where user_id=auth.uid()$$;
    create table public.properties(id uuid primary key,lifecycle_status text,approval_status text);
    create table public.property_members(property_id uuid,user_id uuid,role text,status text);
    create table public.rooms(id uuid primary key,room_code text,price int check(price>=0),room_type text,status text,available_from date,
      property_id uuid references public.properties(id),house_number text,address text,district text,
      lifecycle_status text default 'active',publish_status text default 'published',is_hidden boolean default false,
      archived_at timestamptz,archived_by uuid,updated_at timestamptz default now(),description text,link_zalo text);
    create table public.room_details(room_id uuid primary key references public.rooms(id) on delete cascade,has_balcony boolean);
    create table public.room_media(id uuid primary key default gen_random_uuid(),room_id uuid references public.rooms(id) on delete cascade,
      type text,url text check(url <> 'fixture-rejected-url'),path text,sort_order int,is_cover boolean,provider text);
    alter table public.room_media enable row level security;
    create policy room_media_admin_all on public.room_media for all to authenticated
      using (public.get_my_admin_level() in (1,2)) with check (public.get_my_admin_level() in (1,2));
    create function public.fixture_bump_room_media() returns trigger language plpgsql as $$
      begin
        update public.rooms set updated_at=clock_timestamp() where id=coalesce(new.room_id,old.room_id);
        return null;
      end;
    $$;
    create trigger fixture_media_bump after insert or update or delete on public.room_media
      for each row execute function public.fixture_bump_room_media();
    create table public.room_lifecycle_audit(id uuid primary key default gen_random_uuid(),room_id uuid references public.rooms(id) on delete cascade,
      actor_user_id uuid,actor_role text,action text,reason text,previous_lifecycle_status text,new_lifecycle_status text,
      previous_publish_status text,new_publish_status text,previous_is_hidden boolean,new_is_hidden boolean,source text);
    create function public.admin_upsert_room_v1(p_room_id uuid,p_payload jsonb) returns jsonb language sql as $$
      update public.rooms r set description=coalesce(p_payload->>'description',description),
        price=coalesce((p_payload->>'price')::integer,price),updated_at=clock_timestamp() where id=p_room_id returning to_jsonb(r);
    $$;
    create function public.fixture_publish_rooms() returns trigger language plpgsql security definer as $$
      begin
        update public.rooms set publish_status='published' where property_id=new.id and publish_status='draft';
        return new;
      end;
    $$;
    create trigger fixture_property_sync after update on public.properties
      for each row execute function public.fixture_publish_rooms();
    grant select,update on public.properties to authenticated;
    grant select,insert,update,delete on public.rooms, public.room_details, public.room_media to authenticated, service_role;
  `);
  for (const id of [ids.admin, ids.otherAdmin, ids.staff, ids.owner, ids.manager]) await rows("insert into auth.users values($1,'{}')", [id]);
  await rows("insert into public.admin_users values ($1,1,'Admin A'),($2,1,'Admin B'),($3,2,'Admin L2')", [ids.admin, ids.otherAdmin, ids.staff]);
  await rows("insert into public.properties values($1,'active','approved')", [ids.property]);
  await rows("insert into public.property_members values($1,$2,'owner','active'),($1,$3,'manager','active')", [ids.property, ids.owner, ids.manager]);
  const originalHiddenSave = readFileSync("supabase/migrations/20260906075952_room_availability_dates.sql", "utf8")
    .match(/CREATE OR REPLACE FUNCTION public\.admin_l1_save_hidden_room_v1\([\s\S]*?\$function\$;/)[0];
  await db.exec(originalHiddenSave);
  await db.exec(readFileSync("supabase/migrations/20261107175109_room_audit_history.sql", "utf8"));
  const optimization = readFileSync("supabase/migrations/20261107220105_admin_room_media_and_description_history.sql", "utf8");
  await db.exec(optimization);
  await db.exec(optimization);

  await identity(ids.admin);
  await rows("insert into public.rooms(id,property_id,room_code,price,description,link_zalo) values($1,$2,'P101',100,'private text','secret URL')", [ids.room, ids.property]);
  const created = await last();
  assert.equal(created.action, "CREATE_ROOM");
  assert.equal(Object.hasOwn(created.after_data, "description"), false);
  await identity(ids.admin);
  await rows("update public.rooms set description='description-only edit' where id=$1", [ids.room]);
  assert.equal((await last()).id, created.id);
  await identity(ids.admin, "authenticated", { "x-room-audit-source": "zalo_import", "x-room-audit-actor": ids.otherAdmin });
  await rows("update public.rooms set price=200, description='private replacement' where id=$1", [ids.room]);
  const priceEvent = await last();
  assert.equal(priceEvent.actor_user_id, ids.admin);
  assert.equal(priceEvent.actor_display_name_snapshot, "Admin A");
  assert.equal(priceEvent.source, "admin");
  assert.deepEqual(priceEvent.before_data, { price: 100 });
  assert.deepEqual(priceEvent.after_data, { price: 200 });
  await rows("update public.rooms set updated_at=clock_timestamp() where id=$1", [ids.room]);
  await assert.rejects(() => rows("update public.rooms set price=-1 where id=$1", [ids.room]), /constraint/);
  await db.exec("begin");
  await rows("update public.rooms set price=900 where id=$1", [ids.room]);
  assert.equal((await rows("select after_data->>'price' as price from public.room_audit_events order by event_order desc limit 1"))[0].price, "900");
  await db.exec("rollback");
  assert.equal((await last()).id, priceEvent.id);

  await identity(ids.admin);
  await rows("update public.rooms set is_hidden=true,publish_status='hidden' where id=$1", [ids.room]);
  const hidden = await last();
  assert.equal(hidden.action, "HIDE_ROOM");
  await identity("", "anon");
  await assert.rejects(() => rows("select id from public.room_audit_events"), /permission denied/);
  await identity(ids.staff);
  assert.deepEqual(await rows("select id from public.room_audit_events where room_id=$1 limit 1 offset 0", [ids.room]), []);
  await assert.rejects(() => rows("select public.restore_room_audit_event_v1($1,'visibility')", [hidden.id]), /FORBIDDEN/);
  await identity(ids.owner);
  assert.deepEqual(await rows("select id from public.room_audit_events"), []);
  await assert.rejects(() => rows("select public.restore_room_audit_event_v1($1,'visibility')", [hidden.id]), /FORBIDDEN/);
  await rows("update public.rooms set description='owner private replacement' where id=$1", [ids.room]);
  assert.equal((await last()).id, hidden.id);
  await identity(ids.owner);
  await rows("update public.rooms set room_type='Studio' where id=$1", [ids.room]);
  assert.equal((await last()).actor_role, "owner");
  await identity(ids.manager);
  await rows("insert into public.room_details values($1,true)", [ids.room]);
  assert.equal((await last()).actor_role, "manager");
  await identity(ids.admin);
  await assert.rejects(() => rows("delete from public.room_audit_events"), /permission denied/);
  await rows("select public.restore_room_audit_event_v1($1,'visibility')", [hidden.id]);
  assert.equal((await last()).source, "history_restore");
  assert.deepEqual((await rows("select room_type,is_hidden,publish_status from public.rooms"))[0], { room_type: "Studio", is_hidden: false, publish_status: "published" });
  await identity(ids.admin);
  await rows("select public.restore_room_audit_event_v1($1,'price')", [priceEvent.id]);
  assert.deepEqual((await rows("select price,description from public.rooms"))[0], { price: 100, description: "owner private replacement" });
  const restore = await last();
  assert.equal(restore.action, "RESTORE_ROOM");
  await identity(ids.otherAdmin);
  await rows("update public.rooms set price=300 where id=$1", [ids.room]);
  await rows("update public.rooms set price=200 where id=$1", [ids.room]);
  await identity(ids.admin);
  await assert.rejects(() => rows("select public.restore_room_audit_event_v1($1,'price')", [priceEvent.id]), /ROOM_HISTORY_CONFLICT/);
  assert.equal((await rows("select price from public.rooms"))[0].price, 200);

  const operation = randomUUID();
  await identity("", "service_role", { "x-room-audit-source": "zalo_import", "x-room-audit-actor": ids.otherAdmin, "x-room-audit-operation": operation });
  await rows("update public.rooms set price=350, description='import private text' where id=$1", [ids.room]);
  const imported = await last();
  assert.equal(imported.action, "APPROVE_IMPORT_UPDATE");
  assert.equal(imported.actor_user_id, ids.otherAdmin);
  assert.equal(imported.operation_id, operation);
  assert.deepEqual(imported.changed_fields, ["price"]);
  await identity("", "service_role", { "x-room-audit-source": "zalo_automation", "x-room-audit-actor": ids.otherAdmin });
  await rows("update public.rooms set price=400 where id=$1", [ids.room]);
  const automated = await last();
  assert.equal(automated.action, "APPROVE_IMPORT_UPDATE");
  assert.equal(automated.source, "zalo_automation");
  assert.equal(automated.actor_user_id, null);
  await identity(ids.admin);
  await rows("update public.rooms set publish_status='draft' where id=$1", [ids.room]);
  await rows("update public.properties set approval_status='approved' where id=$1", [ids.property]);
  const synced = await last();
  assert.equal(synced.source, "system_sync");
  assert.equal(synced.actor_user_id, null);
  await identity(ids.admin);
  await rows("insert into public.room_media values($1,$2,'image','https://example.com/?token=secret','private-key',1,true,'r2')", [ids.media, ids.room]);
  await rows("update public.room_media set sort_order=3,url='another-secret' where id=$1", [ids.media]);
  const media = await last();
  assert.equal(media.action, "MEDIA_UPDATE");
  assert.equal(media.room_reference.media_id, ids.media);
  assert.deepEqual(media.changed_fields, ["media_reference_changed", "sort_order"]);
  assert.doesNotMatch(JSON.stringify(media), /secret|private-key/);
  await identity(ids.admin);
  await assert.rejects(() => rows("select public.restore_room_audit_event_v1($1,'price')", [media.id]), /RESTORE_FIELD_UNSUPPORTED/);
  await rows("insert into public.rooms(id,property_id,room_code,price) values($1,$2,'P102',400)", [ids.archivedRoom, ids.property]);
  await rows("update public.rooms set lifecycle_status='archived',is_hidden=true,publish_status='hidden' where id=$1", [ids.archivedRoom]);
  const archived = await last();
  assert.equal(archived.action, "ARCHIVE_ROOM");
  await rows("update public.rooms set room_code=' p101 ' where id=$1", [ids.archivedRoom]);
  await identity(ids.admin);
  await assert.rejects(() => rows("select public.restore_room_audit_event_v1($1,'visibility')", [archived.id]), /ROOM_HISTORY_CONFLICT/);
  assert.ok((await rows("select total from public.room_audit_today_v1()"))[0].total > 0);
  assert.equal((await rows("select id from public.room_audit_events where source='zalo_import' order by created_at desc limit 1 offset 0"))[0].id, imported.id);
  await db.exec("reset role");
  await rows("insert into public.room_lifecycle_audit values($1,$2)", [ids.legacy, ids.room]);
  await identity(ids.admin);
  await rows("delete from public.rooms where id=$1", [ids.room]);
  const deleted = await last();
  assert.equal(deleted.action, "DELETE_ROOM");
  assert.equal(deleted.before_data.media.length, 1);
  assert.equal((await rows("select count(*) from public.room_lifecycle_audit"))[0].count, 1);
  assert.equal((await rows("select count(*) from public.room_audit_events where id=$1", [priceEvent.id]))[0].count, 1);
  await identity(ids.admin);
  await assert.rejects(() => rows("select public.restore_room_audit_event_v1($1,'price')", [priceEvent.id]), /ROOM_NO_LONGER_EXISTS/);
  await rows("insert into public.rooms(id,property_id,lifecycle_status) values($1,$2,'archived')", [ids.purgedRoom, ids.property]);
  await rows("update public.rooms set price=300 where id=$1", [ids.purgedRoom]);
  const nullable = await last();
  await identity(ids.admin);
  await rows("select public.restore_room_audit_event_v1($1,'price')", [nullable.id]);
  assert.equal((await rows("select price from public.rooms where id=$1", [ids.purgedRoom]))[0].price, null);
  await identity("", "system");
  await rows("delete from public.rooms where id=$1", [ids.purgedRoom]);
  assert.equal((await last()).action, "PURGE_ROOM");

  const mediaSnapshot = async () => (await rows("select id,type,url,sort_order,is_cover from public.room_media where room_id=$1 order by id", [ids.mediaRoom]));
  const syncMedia = async (desired, expected) => (await rows("select public.sync_admin_room_media_v1($1,$2,$3) as membership_changed",
    [ids.mediaRoom, JSON.stringify(desired), JSON.stringify(expected)]))[0].membership_changed;
  const roomUpdatedAt = async () => (await rows("select updated_at::text from public.rooms where id=$1", [ids.mediaRoom]))[0].updated_at;
  const first = { type: "image", url: "https://example.com/first" };
  const second = { type: "image", url: "https://example.com/second" };
  await identity(ids.admin);
  await rows("insert into public.rooms(id,property_id,room_code) values($1,$2,'MEDIA')", [ids.mediaRoom, ids.property]);
  await rows("insert into public.room_media values($1,$2,'image',$3,'retained-path',0,true,'cloudinary')", [ids.retainedMedia, ids.mediaRoom, first.url]);
  const initialMedia = await mediaSnapshot();
  const beforeNoop = await roomUpdatedAt();
  const beforeNoopEvent = await last();
  await identity(ids.admin);
  assert.equal(await syncMedia([first], initialMedia), false);
  assert.equal(await roomUpdatedAt(), beforeNoop);
  assert.equal((await last()).id, beforeNoopEvent.id);
  await identity(ids.owner);
  await assert.rejects(() => syncMedia([first, second], initialMedia), /FORBIDDEN/);
  await identity(ids.staff);
  assert.equal(await syncMedia([first, second, first], initialMedia), true);
  const expandedMedia = await mediaSnapshot();
  assert.equal(expandedMedia.length, 3);
  assert.notEqual(await roomUpdatedAt(), beforeNoop);
  const expansion = await last();
  assert.equal(expansion.action, "MEDIA_UPDATE");
  assert.deepEqual(expansion.before_data, {});
  assert.equal(expansion.after_data.provider, "r2");
  assert.equal(expansion.actor_user_id, ids.staff);
  await identity(ids.admin);
  await assert.rejects(() => syncMedia([], initialMedia), /ROOM_MEDIA_CONFLICT/);
  await assert.rejects(() => syncMedia([{ type: "image", url: "fixture-rejected-url" }], expandedMedia), /constraint/);
  assert.deepEqual(await mediaSnapshot(), expandedMedia);
  assert.equal((await last()).id, expansion.id);
  await identity(ids.admin);
  assert.equal(await syncMedia([second, first, first], expandedMedia), false);
  const reorderedMedia = await mediaSnapshot();
  assert.deepEqual(reorderedMedia.map(({ id }) => id), expandedMedia.map(({ id }) => id));
  assert.equal(reorderedMedia.find(({ url }) => url === second.url).is_cover, true);
  assert.equal((await last()).action, "MEDIA_UPDATE");
  await identity(ids.admin);
  assert.equal(await syncMedia([first], reorderedMedia), true);
  assert.deepEqual((await rows("select id,path,provider,is_cover from public.room_media where room_id=$1", [ids.mediaRoom])),
    [{ id: ids.retainedMedia, path: "retained-path", provider: "cloudinary", is_cover: true }]);
  await identity(ids.admin);
  assert.equal(await syncMedia([], await mediaSnapshot()), true);
  assert.deepEqual(await mediaSnapshot(), []);
  assert.doesNotMatch(JSON.stringify(await rows("select before_data,after_data from public.room_audit_events where room_id=$1", [ids.mediaRoom])), /example\.com|retained-path/);

  await identity(ids.admin);
  await rows("update public.rooms set is_hidden=true,publish_status='hidden' where id=$1", [ids.mediaRoom]);
  const hiddenMediaRoom = await last();
  await identity(ids.admin);
  await rows("select public.admin_l1_save_hidden_room_v1($1,'{\"description\":\"only description\"}','keep_hidden')", [ids.mediaRoom]);
  assert.equal((await last()).id, hiddenMediaRoom.id);
  assert.deepEqual(await rows("select action from public.room_lifecycle_audit where room_id=$1", [ids.mediaRoom]), []);
  await identity(ids.admin);
  await rows("select public.admin_l1_save_hidden_room_v1($1,'{\"price\":250}','keep_hidden')", [ids.mediaRoom]);
  assert.equal((await last()).after_data.price, 250);
  assert.deepEqual(await rows("select action from public.room_lifecycle_audit where room_id=$1", [ids.mediaRoom]), [{ action: "updated_while_hidden" }]);
  await identity(ids.admin);
  await rows("select public.admin_l1_save_hidden_room_v1($1,'{}','restore')", [ids.mediaRoom]);
  assert.deepEqual(await rows("select description,price,is_hidden,publish_status from public.rooms where id=$1", [ids.mediaRoom]),
    [{ description: "only description", price: 250, is_hidden: false, publish_status: "published" }]);
  console.log("Offline room audit PASS: actors, no-op, redact, transactional failure, restore/conflict, permissions, filters, media and hard delete");
} finally {
  await db.close();
}
