create table if not exists public.owner_member_contacts (
  owner_user_id uuid not null
    references auth.users(id) on delete cascade,
  member_user_id uuid not null
    references auth.users(id) on delete cascade,
  display_name text,
  contact_email text,
  contact_phone text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
    references auth.users(id) on delete set null,

  constraint owner_member_contacts_pkey
    primary key (owner_user_id, member_user_id),
  constraint owner_member_contacts_distinct_users
    check (owner_user_id <> member_user_id),
  constraint owner_member_contacts_display_name_length
    check (display_name is null or char_length(display_name) <= 200),
  constraint owner_member_contacts_email_length
    check (contact_email is null or char_length(contact_email) <= 320),
  constraint owner_member_contacts_phone_length
    check (contact_phone is null or char_length(contact_phone) <= 50),
  constraint owner_member_contacts_note_length
    check (note is null or char_length(note) <= 2000)
);

comment on table public.owner_member_contacts is
  'Owner-specific contact overrides for members who share an active property.';

alter table public.owner_member_contacts enable row level security;

-- Direct browser access is intentionally disabled. The existing owner RPCs
-- validate auth.uid(), shared-property membership and the owner role before
-- reading or updating these overrides.
revoke all on table public.owner_member_contacts from public, anon, authenticated;
grant all on table public.owner_member_contacts to service_role;
