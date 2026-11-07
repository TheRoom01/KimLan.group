import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { PGlite } = require(process.env.OFFLINE_SQL_RUNTIME ||
  path.resolve(".zalo-reader/offline-sql-runtime/node_modules/@electric-sql/pglite"));
const db = new PGlite();
const ids = Object.fromEntries(["admin", "staff", "owner", "manager", "property", "room", "importRoom", "pending",
  "contract", "deposit", "tenant", "member", "legacy", "operation"].map(key => [key, randomUUID()]));
const query = (sql, args) => db.query(sql, args);
const last = async () => {
  await db.exec("reset role");
  return (await query("select *, round(extract(epoch from (expires_at - created_at))/86400)::int days from public.owner_audit_logs order by created_at desc, id desc limit 1")).rows[0];
};
const count = async () => {
  await db.exec("reset role");
  return (await query("select count(*)::int count from public.owner_audit_logs")).rows[0].count;
};
const identity = async (actor, role = "authenticated", headers = {}) => {
  await db.exec("reset role");
  await query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claims',$2,false), set_config('request.headers',$3,false)",
    [actor, JSON.stringify({ role }), JSON.stringify(headers)]);
  if (role !== "postgres") await db.exec(`set role ${role}`);
};

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,service_role;
    create table admin_users(user_id uuid primary key,level int,full_name text);
    create table owner_portal_profiles(user_id uuid primary key,full_name text);
    create table properties(id uuid primary key,name text,address text,approval_status text,lifecycle_status text,
      default_room_data jsonb,normalized_property_key text,latitude double precision,longitude double precision,updated_at timestamptz);
    create table rooms(id uuid primary key,property_id uuid references properties(id),owner_id uuid,room_code text,price int,description text,
      status text,available_from date,address text,zalo_phone text,chinh_sach text,search_text text,house_number text,district text,
      lifecycle_status text default 'active',publish_status text,is_hidden boolean default false,lat double precision,
      lng double precision,updated_at timestamptz);
    create table room_media(id uuid primary key default gen_random_uuid(),room_id uuid references rooms(id) on delete cascade,
      url text,type text,sort_order int,updated_at timestamptz);
    create table room_details(room_id uuid primary key references rooms(id) on delete cascade);
    create table room_lifecycle_audit(id uuid primary key,room_id uuid references rooms(id) on delete cascade);
    create table property_members(id uuid primary key default gen_random_uuid(),property_id uuid references properties(id) on delete cascade,
      user_id uuid,role text,status text,updated_at timestamptz);
    create table rental_contracts(id uuid primary key,room_id uuid references rooms(id),contract_type text default 'lease',
      status text default 'active',deposit_amount int,booking_status text,end_date date,deleted_at timestamptz,updated_at timestamptz);
    create table contract_tenants(id uuid primary key,contract_id uuid references rental_contracts(id),tenant_id uuid,role text);
    create table pending_room_versions(id uuid primary key,status text,
      approved_room_id uuid,approved_by uuid,matched_room_id uuid);
    create table owner_audit_logs(id uuid primary key default gen_random_uuid(), property_id uuid references properties(id) on delete set null,
      actor_id uuid references auth.users(id),actor_role text,entity_type text,entity_id uuid,action text,old_data jsonb,new_data jsonb,
      reason text,source text not null default 'owner_portal' check(source in ('admin_l1','admin_l2','owner_portal','system','rpc')),
      created_at timestamptz not null default now());
    alter table owner_audit_logs enable row level security;
    create function is_admin_l1() returns boolean language sql security definer as
      $$select exists(select 1 from public.admin_users where user_id=auth.uid() and level=1)$$;
    create function can_view_property(uuid) returns boolean language sql security definer as
      $$select exists(select 1 from public.property_members where property_id=$1 and user_id=auth.uid() and status='active')$$;
    create policy owner_audit_logs_select on owner_audit_logs for select to authenticated
      using (is_admin_l1() or can_view_property(property_id));
    create function activate_due_room_availability_v1() returns integer language plpgsql as $$
    declare changed integer;
    begin
      update public.rooms set status='Đang trống',available_from=null where available_from is not null;
      get diagnostics changed = row_count;
      return changed;
    end $$;
    revoke execute on function activate_due_room_availability_v1() from public;
    grant execute on function activate_due_room_availability_v1() to service_role;
    create function purge_owner_trash_v1() returns integer language plpgsql security definer as $$
    declare changed integer;
    begin
      delete from public.rooms where lifecycle_status='archived';
      get diagnostics changed = row_count;
      return changed;
    end $$;
    create function sync_property_shared_room_fields_v1(uuid,text,text,text)
    returns void language plpgsql security definer as $$
    declare target_id uuid := $1;
    begin
      update public.rooms set zalo_phone=$2,chinh_sach=$4 where property_id=target_id;
      if $4 = 'FAIL' then raise exception 'sync failed'; end if;
    end;
    $$;
    create function sync_room_shared_property_fields_v1(uuid,text,text,text,boolean)
    returns void language plpgsql security definer as $$
    declare target_id uuid := $1;
    begin
      update public.rooms set zalo_phone=$2,chinh_sach=$4 where id=target_id;
    end;
    $$;
    create function sync_admin_room_ward_to_property_v1(uuid,text)
    returns void language plpgsql security definer as $$
    declare target_id uuid := $1;
    begin
      update public.rooms set room_code=$2 where id=target_id;
    end;
    $$;
    create function admin_upsert_room_v3(p_room_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer as $$
    begin
      if not exists(select 1 from public.admin_users where user_id=auth.uid() and level in (1,2)) then
        raise exception 'FORBIDDEN' using errcode='42501';
      end if;
      insert into public.rooms(id,property_id,room_code) values(p_room_id,(p_payload->>'property_id')::uuid,p_payload->>'room_code');
      return jsonb_build_object('id',p_room_id,'property_id',p_payload->>'property_id');
    end $$;
    grant select on owner_audit_logs to authenticated;
    grant update on pending_room_versions to authenticated,service_role;
    grant select on pending_room_versions to authenticated,service_role;
    grant select,insert,update,delete on rooms,properties,property_members,rental_contracts,contract_tenants,room_media to authenticated,service_role;
  `);
  await query("insert into auth.users(id) values ($1),($2),($3),($4)", [ids.admin, ids.staff, ids.owner, ids.manager]);
  await query("insert into admin_users values ($1,1,'Admin L1'),($2,2,'Admin L2')", [ids.admin, ids.staff]);
  await query("insert into owner_portal_profiles values ($1,'Chủ nhà'),($2,'Quản lý')", [ids.owner, ids.manager]);
  await query("insert into properties(id,name) values ($1,'Tòa A')", [ids.property]);
  await query("insert into property_members(property_id,user_id,role,status) values ($1,$2,'owner','active'),($1,$3,'manager','active')",
    [ids.property, ids.owner, ids.manager]);
  await query("insert into pending_room_versions(id,status) values($1,'Chờ duyệt')", [ids.pending]);
  await query("insert into owner_audit_logs(id,property_id,entity_id,entity_type,action) values($1,$2,$2,'property','legacy')", [ids.legacy, ids.property]);
  await db.exec(readFileSync("supabase/migrations/20261107175109_room_audit_history.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261107220054_optimize_owner_audit.sql", "utf8"));
  const hiddenRoomMigration = readFileSync("supabase/migrations/20260906075952_room_availability_dates.sql", "utf8");
  await db.exec(hiddenRoomMigration.match(/CREATE OR REPLACE FUNCTION public\.admin_l1_save_hidden_room_v1\([\s\S]*?\$function\$;/)[0]);
  await db.exec(readFileSync("supabase/migrations/20261107220105_admin_room_media_and_description_history.sql", "utf8"));

  await identity(ids.admin);
  await query("insert into rooms(id,property_id,room_code,price,description,status,address) values($1,$2,'P.1',10,'hidden text','Sắp trống','private address')", [ids.room, ids.property]);
  let event = await last();
  assert.equal(event.action, "room_created");
  assert.equal(event.source, "manual");
  assert.equal(event.actor_name, "Admin L1");
  assert.equal(event.days, 30);
  assert.ok(!event.changed_fields.includes("price") && !event.changed_fields.includes("description") && !event.changed_fields.includes("address"));
  assert.ok(!JSON.stringify(event.new_data).includes("hidden text"));

  let total = await count();
  await query("update rooms set room_code=room_code,updated_at=now(),price=11,description='hidden changed text',search_text='auto' where id=$1", [ids.room]);
  await query("update properties set updated_at=now(),default_room_data='{\"description\":\"hidden\"}' where id=$1", [ids.property]);
  assert.equal(await count(), total);
  assert.deepEqual((await query("select changed_fields,before_data,after_data from room_audit_events order by event_order desc limit 1")).rows[0],
    { changed_fields: ["price"], before_data: { price: 10 }, after_data: { price: 11 } });

  const serviceHeaders = { "x-room-audit-source": "zalo_import", "x-room-audit-actor": ids.staff, "x-room-audit-operation": ids.operation };
  await identity(ids.admin, "authenticated", serviceHeaders);
  await query("update rooms set room_code='P.2',available_from='2026-11-12' where id=$1", [ids.room]);
  event = await last();
  assert.equal(event.actor_id, ids.admin);
  assert.equal(event.source, "manual");
  assert.equal(event.days, 60);
  assert.deepEqual(event.changed_fields, ["room_code", "available_from"]);
  assert.deepEqual(event.new_data, { available_from: "2026-11-12" });

  await identity("", "service_role", serviceHeaders);
  await query("update rooms set zalo_phone='0123',available_from='2026-11-13',price=12 where id=$1", [ids.room]);
  event = await last();
  assert.equal(event.actor_role, "admin_l2");
  assert.equal(event.actor_name, "Admin L2");
  assert.equal(event.source, "zalo_imports");
  assert.equal(event.days, 90);
  assert.equal(event.operation_id, ids.operation);
  assert.deepEqual(event.new_data, { available_from: "2026-11-13", zalo_phone: "0123" });

  const importArgs = [ids.importRoom, { property_id: ids.property, room_code: "P.Zalo" }];
  const approve = () => query("update pending_room_versions set status='Đã duyệt',approved_room_id=$2,approved_by=$3 where id=$1",
    [ids.pending, ids.importRoom, ids.staff]);
  const reopen = matched => query("update pending_room_versions set status='Chờ duyệt',approved_room_id=null,approved_by=null,matched_room_id=$2 where id=$1",
    [ids.pending, matched]);
  await identity(ids.owner, "authenticated", serviceHeaders);
  await assert.rejects(query("select admin_upsert_room_v3($1,$2)", importArgs), { code: "42501" });
  await identity(ids.staff, "authenticated", serviceHeaders);
  await query("select admin_upsert_room_v3($1,$2)", importArgs);
  assert.equal((await last()).source, "manual");

  await identity(ids.staff, "authenticated", serviceHeaders);
  await approve();
  assert.equal((await last()).source, "manual", "authenticated headers cannot mark Imports provenance");
  await reopen(null);
  await identity("", "service_role", { ...serviceHeaders, "x-room-audit-actor": ids.admin });
  await approve();
  assert.equal((await last()).source, "manual", "the server actor must match the recorded approver");
  await reopen(ids.importRoom);
  await identity("", "service_role", serviceHeaders);
  await approve();
  assert.equal((await last()).source, "manual", "approving an update does not relabel the original creation");
  await reopen(null);
  await identity("", "service_role", serviceHeaders);
  await approve();
  event = await last();
  assert.equal(event.source, "zalo_imports");
  assert.equal(event.actor_id, ids.staff);
  assert.equal(event.operation_id, ids.operation);
  assert.equal(event.days, 30);

  await identity(ids.owner);
  await query("update properties set default_room_data='{\"description\":\"secret\",\"zalo_phone\":\"0900\",\"badges\":[\"test\"]}' where id=$1", [ids.property]);
  event = await last();
  assert.equal(event.source, "owner");
  assert.equal(event.actor_name, "Chủ nhà");
  assert.equal(event.days, 90);
  assert.deepEqual(event.new_data, { "default_room_data.zalo_phone": "0900" });
  await identity(ids.owner);
  assert.deepEqual((await query("select id from owner_audit_logs")).rows, [{ id: ids.legacy }]);
  await query("select sync_property_shared_room_fields_v1($1,'same phone',null,'shared policy')", [ids.property]);
  event = await last();
  assert.equal(event.source, "system");
  assert.equal(event.actor_id, ids.owner);
  assert.equal(event.days, 30);
  assert.deepEqual(event.changed_fields, ["zalo_phone", "chinh_sach"]);
  assert.equal(event.new_data, null);
  await identity(ids.owner);
  await assert.rejects(query("select owner_audit_private.set_source('cron')"), { code: "42501" });
  await assert.rejects(query("select sync_property_shared_room_fields_v1($1,null,null,'FAIL')", [ids.property]), /sync failed/);
  await query("select set_config('app.owner_audit_source','cron',false), set_config('app.owner_audit_inherited_sync','on',false)");
  await query("update rooms set zalo_phone='0999' where id=$1", [ids.room]);
  event = await last();
  assert.equal(event.source, "owner");
  assert.equal(event.days, 90);
  assert.deepEqual(event.new_data, { zalo_phone: "0999" });
  assert.equal((await query("select count(*)::int as n from owner_audit_private.transaction_source")).rows[0].n, 0);

  const priceEvent = (await query("select id from room_audit_events where room_id=$1 and 'price'=any(changed_fields) order by event_order desc limit 1", [ids.room])).rows[0];
  await identity(ids.admin);
  await query("select restore_room_audit_event_v1($1,'price')", [priceEvent.id]);
  event = await last();
  assert.equal(event.action, "room_restored");
  assert.equal(event.source, "manual");
  assert.equal(event.actor_id, ids.admin);

  await identity(ids.manager);
  await query("insert into property_members(id,property_id,user_id,role,status) values($1,$2,$3,'viewer','active')", [ids.member, ids.property, ids.staff]);
  event = await last();
  assert.equal(event.source, "manager");
  assert.equal(event.actor_name, "Quản lý");
  assert.equal(event.days, 90);

  await query("insert into rental_contracts(id,room_id,contract_type,booking_status) values($1,$3,'lease',null),($2,$3,'deposit','holding')",
    [ids.contract, ids.deposit, ids.room]);
  event = await last();
  assert.equal(event.days, 30);
  assert.equal(event.entity_id, ids.deposit);
  await query("update rental_contracts set booking_status='cancelled',status='cancelled' where id=$1", [ids.deposit]);
  assert.equal((await last()).days, 30);
  await query("update rental_contracts set deposit_amount=4,end_date='2027-01-10' where id=$1", [ids.contract]);
  assert.equal((await last()).days, 90);
  await query("insert into contract_tenants values($1,$2,$3,'tenant')", [randomUUID(), ids.contract, ids.tenant]);
  assert.equal((await last()).days, 30);
  await query("delete from contract_tenants where contract_id=$1", [ids.contract]);
  assert.equal((await last()).days, 90);

  total = await count();
  await identity("", "postgres");
  await query("update rooms set lat=10.1,lng=106.1 where id=$1", [ids.room]);
  assert.equal(await count(), total);
  await identity("", "service_role", serviceHeaders);
  assert.equal((await query("select activate_due_room_availability_v1() as n")).rows[0].n, 1);
  event = await last();
  assert.equal(event.source, "cron");
  assert.equal(event.actor_role, "system");
  assert.equal(event.actor_id, null);
  assert.equal(event.days, 30);

  await identity(ids.admin);
  await query("insert into room_media(room_id,url,type,sort_order) values ($1,'https://private/one','image',1),($1,'https://private/two','image',2)", [ids.room]);
  event = await last();
  assert.equal(event.action, "room_media_changed");
  assert.equal(event.days, 30);
  assert.deepEqual(event.changed_fields, ["media"]);
  assert.equal(event.old_data, null);
  assert.equal(event.new_data, null);
  assert.equal((await query("select count(*)::int count from owner_audit_logs where action='room_media_changed'")).rows[0].count, 1);
  total = await count();
  await query("update room_media set updated_at=now() where room_id=$1", [ids.room]);
  assert.equal(await count(), total);
  await query("update room_media set url=url || '/updated' where room_id=$1", [ids.room]);
  assert.equal(await count(), total + 1);
  const mediaHistory = (await query("select * from room_audit_events where room_id=$1 and entity='room_media' order by event_order desc", [ids.room])).rows;
  assert.equal(mediaHistory.length, 4);
  assert.deepEqual(mediaHistory[0].changed_fields, ["media_reference_changed"]);
  assert.doesNotMatch(JSON.stringify(mediaHistory), /https:\/\/private/);
  assert.equal((await query("select expires_at from owner_audit_logs where id=$1", [ids.legacy])).rows[0].expires_at, null);

  console.log("owner audit SQL passed: provenance, retention, minimal payloads, legacy access, and media markers");
} finally {
  await db.close();
}
