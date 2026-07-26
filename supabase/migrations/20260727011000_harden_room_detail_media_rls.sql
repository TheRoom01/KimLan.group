begin;

drop policy if exists "read room_details anon + admins"
on public.room_details;

drop policy if exists "Allow public read room_media"
on public.room_media;

drop policy if exists room_media_admin_all
on public.room_media;

create policy room_media_admin_all
on public.room_media
as permissive
for all
to authenticated
using (
  public.get_my_admin_level() in (1, 2)
)
with check (
  public.get_my_admin_level() in (1, 2)
);

commit;
