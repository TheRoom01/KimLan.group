-- Zalo drafts and temporary media metadata are accessed through trusted server routes.
alter table public.pending_room_versions enable row level security;
alter table public.zalo_import_batches enable row level security;
alter table public.zalo_import_images enable row level security;
alter table public.zalo_import_videos enable row level security;

revoke all on table public.pending_room_versions, public.zalo_import_batches,
  public.zalo_import_images, public.zalo_import_videos from public, anon, authenticated;
