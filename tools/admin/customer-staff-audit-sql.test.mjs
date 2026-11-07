import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { PGlite } = require(process.env.OFFLINE_SQL_RUNTIME ||
  path.resolve('.zalo-reader/offline-sql-runtime/node_modules/@electric-sql/pglite'));
const db = new PGlite();
const rows = async (sql, args) => (await db.query(sql, args)).rows;
const migration = (filename) => db.exec(readFileSync(new URL(`../../supabase/migrations/${filename}.sql`, import.meta.url), 'utf8'));
const [l1, l2, staff, customer] = Array.from({ length: 4 }, randomUUID);
const as = async (id, role = 'authenticated') => {
  await db.exec('reset role');
  await rows("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec(`set role ${role}`);
};

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; grant usage on schema auth to anon,authenticated,service_role;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table auth.users(id uuid primary key,email text,phone text,created_at timestamptz default now(),
      banned_until timestamptz,raw_user_meta_data jsonb,encrypted_password text,updated_at timestamptz);
    create table public.admin_users(user_id uuid primary key,level integer,email text,phone text,full_name text,created_at timestamptz);
    create function public.get_my_admin_level() returns integer language sql stable security definer set search_path='' as
      $$ select level from public.admin_users where user_id=auth.uid() $$;
  `);
  await migration('20260906135731_visitor_reports');
  await migration('20261102162600_admin_staff_accounts');
  await migration('20261102165958_manage_staff_accounts');
  await rows("insert into public.admin_users(user_id,level,full_name) values($1,1,'Admin one'),($2,2,'Admin two')", [l1,l2]);
  await rows("insert into auth.users(id,email) values($1,'staff@example.com'),($2,'customer@example.com')", [staff,customer]);
  await rows("insert into admin_staff_private.account_events(actor_id,target_id,action,old_level,new_level,created_at) values($1,$2,'role',1,2,now()-interval '7 days')", [l1,l2]);
  await rows("insert into public.visitor_events(id,visitor_id,action,created_at) values(gen_random_uuid(),$1,'page_view',now()-interval '7 days')", [customer]);
  const ownerMigration = readFileSync(new URL('../../supabase/migrations/20261107220054_optimize_owner_audit.sql', import.meta.url), 'utf8');
  await db.exec(ownerMigration.slice(ownerMigration.indexOf('create schema if not exists owner_audit_private;'),
    ownerMigration.indexOf('create or replace function owner_audit_private.capture()')));
  await migration('20261107220100_retain_customer_and_staff_audit');

  await as('', 'service_role');
  const add = (action, details, id = randomUUID()) => rows('select public.record_visitor_event_v2($1,$2,$3,$4,$5,$6,$7,$8)',
    [id, customer, action, action === 'room_view' ? staff : null, null, null, null, details && JSON.stringify(details)]);
  await rows("select public.record_visitor_event_v1(gen_random_uuid(),$1,'page_view',null,null,null,null)", [customer]);
  await add('admin_click');
  const duplicateId = randomUUID();
  await add('keyword_search', {keyword: 'phường 13', ward: '13'}, duplicateId);
  await add('keyword_search', {keyword: 'phường 13', ward: '13'}, duplicateId);
  await add('filter_use', {minPrice: 3e6, districts: ['Quận 1'], roomTypes: ['Studio'], amenities: ['balcony']});
  await add('room_view');
  await db.exec("insert into public.visitor_events(id,visitor_id,action,created_at,expires_at) values(gen_random_uuid(),gen_random_uuid(),'filter_use',now()-interval '31 days',now()-interval '1 day')");

  await as(l2);
  assert.deepEqual(await rows('select * from public.visitor_events'), []);
  await assert.rejects(rows('select public.reports_staff_audit_v1()'), { code: '42501' });
  await assert.rejects(rows("select public.grant_staff_account('staff@example.com','Staff','0123456789',2)"), { code: '42501' });
  await assert.rejects(rows('select * from admin_staff_private.account_events'), { code: '42501' });
  await as('', 'anon');
  await assert.rejects(rows('select public.reports_staff_audit_v1()'), { code: '42501' });
  await assert.rejects(rows('select public.record_visitor_event_v2(null,null,null,null,null,null,null,null)'), { code: '42501' });

  await as(l1);
  const report = (await rows('select public.reports_visitors_v1(90) as r'))[0].r;
  assert.equal(report.visitors, 1);
  assert.deepEqual(report.filters, {price: 1, district: 1, ward: 1, room_type: 1, amenities: 1});
  assert.equal(report.actions.length, 3);
  assert.equal(report.actions.find(a => a.action === 'keyword_search').events, 1);
  assert.deepEqual(await rows("select distinct (expires_at-created_at)::text as ttl from public.visitor_events"), [{ttl: '30 days'}]);

  await rows("select public.grant_staff_account('staff@example.com','Staff','0123456789',2)");
  await rows("select public.manage_staff_account($1,'role',2,2)", [staff]);
  await rows("select public.manage_staff_account($1,'role',1,2)", [staff]);
  await assert.rejects(rows("select public.manage_staff_account($1,'role',2,2)", [staff]), /STAFF_CONFLICT/);
  let events = (await rows('select public.reports_staff_audit_v1() as r'))[0].r;
  assert.deepEqual(events.map(e => e.action), ['role','grant','role']);
  assert.deepEqual(events[0].old_data, {level: 2});
  assert.deepEqual(events[0].new_data, {level: 1});
  assert.equal(events[0].actor_id, l1);
  assert.equal(events[0].actor_name, 'Admin one');
  assert.equal(events[0].actor_role, 'admin_l1');
  assert.equal(events[0].source, 'manual');
  assert.ok(events[0].operation_id);

  // Simulate Dashboard and GoTrue writing with no reliable actor or plaintext payload.
  await db.exec('reset role');
  await rows("select set_config('kimlan.staff_audit_source','manual',false)");
  await rows("update public.admin_users set phone='0123456789', full_name='Staff' where user_id=$1", [staff]);
  await rows("update public.admin_users set phone='0123456790', full_name='Staff changed' where user_id=$1", [staff]);
  await rows("update auth.users set banned_until=now()+interval '1 day' where id=$1", [staff]);
  await rows("update auth.users set banned_until=null, created_at=created_at-interval '1 day' where id=$1", [staff]);
  await rows("update auth.users set updated_at=now(),encrypted_password='never capture' where id=$1", [staff]);
  await rows("update auth.users set banned_until=now()+interval '1 day' where id=$1", [customer]);
  assert.deepEqual(await rows("select distinct (expires_at-created_at)::text as ttl from admin_staff_private.account_events"), [{ttl: '90 days'}]);
  await as(l1);
  events = (await rows('select public.reports_staff_audit_v1() as r'))[0].r;
  assert.deepEqual(events.map(e => e.action), ['unlock','lock','phone','role','grant','role']);
  assert.deepEqual(events[0].changed_fields, ['banned_until','auth_created_at']);
  assert.equal(events[0].new_data.banned_until, null);
  assert.deepEqual(events[2].changed_fields, ['phone','full_name']);
  assert.deepEqual(events[2].new_data, {});
  assert.equal(events[2].source, 'system');
  assert.equal(events[2].actor_id, null);
  assert.equal(events[2].actor_role, 'system');
  assert.doesNotMatch(JSON.stringify(events), /0123456790|Staff changed|never capture|staff@example.com/);
  await rows("select public.manage_staff_account($1,'delete',null,1)", [staff]);
  const deleted = (await rows('select public.reports_staff_audit_v1() as r'))[0].r[0];
  assert.equal(deleted.action, 'delete');
  assert.deepEqual(deleted.old_data, {level: 1});
  await db.exec('reset role');
  assert.equal((await rows('select id from auth.users where id=$1', [staff]))[0].id, staff);
  console.log('Customer activity and staff audit SQL fixtures passed');
} finally {
  await db.close();
}
