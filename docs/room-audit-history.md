# Lịch sử thao tác phòng

## Đối chiếu với mã và migration hiện tại

| Phạm vi | Hiện trạng trong repo |
| --- | --- |
| A. Lịch sử vòng đời | `20260731020000_room_hidden_audit_and_property_release.sql` ghi trạng thái vòng đời, xuất bản và ẩn trước/sau, người thực hiện, nguồn và lý do. Luồng lưu phòng ẩn trong `20260906075952_room_availability_dates.sql` tiếp tục dùng cơ chế cũ. |
| B. Phiên bản nội dung | `admin_upsert_room_v1/v3`, các luồng chủ nhà và các API chi tiết/media ghi vào các bảng phòng. Snapshot của Pending phục vụ so sánh một lượt duyệt Zalo và không bao phủ lịch sử sửa giá, loại phòng, tiện ích hoặc media toàn hệ thống. |
| C. Xóa vĩnh viễn | `admin_l1_delete_room` và `purge_owner_trash_v1` xóa hàng `rooms`. FK cũ của `room_lifecycle_audit` xóa lịch sử theo phòng. Migration mới gỡ FK này và giữ nguyên trigger, RPC và dữ liệu cũ. Báo cáo chỉ đọc bảng mới, nên thao tác vòng đời xuất hiện một lần trên báo cáo. |
| D. Danh tính | RPC theo phiên đọc `auth.uid()`. Các đường ghi qua service role có thể thiếu người dùng; duyệt Zalo, cập nhật chi tiết và luồng xuất bản dự phòng truyền ngữ cảnh server sau khi xác thực. Zalo tự động và đồng bộ tòa nhà ghi nguồn hệ thống. Service role còn lại và SQL trực tiếp dùng nguồn dự phòng khi thiếu ngữ cảnh. |
| E. Sai khác môi trường | Đối chiếu chỉ dựa trên repo. Cần xác minh các phiên bản migration, tên FK, quyền ghi bảng, trigger, RPC và cấu hình dọn thùng rác trên môi trường đích. |

## Phạm vi và quyền

- `/reports/room-history` dùng tài khoản hiện tại và RLS Admin L1, phân trang 20 sự kiện mỗi lần. Số liệu hôm nay tính theo giờ Việt Nam và độc lập với bộ lọc danh sách. Mã thao tác dùng mã yêu cầu server hoặc mã giao dịch DB.
- Trigger ghi cùng giao dịch với `rooms`, `room_details` và `room_media`. Sửa chỉ `updated_at` không phát sinh lịch sử. Diff chỉ giữ dữ liệu kinh doanh được cho phép. Nội dung tự do có thể nhạy cảm chỉ ghi dấu đã thay đổi. Audit mới bắt đầu từ lúc kích hoạt trigger.
- Khôi phục giá hoặc đảo thao tác ẩn/lưu trữ đủ điều kiện. RPC khóa hàng, kiểm tra giá trị hiện tại và phát hiện sự kiện mới hơn trên cùng trường. Khôi phục hiển thị kiểm tra tòa nhà, mã phòng trùng và điều kiện xuất bản, rồi ghi một sự kiện mới.
- Phòng đã xóa cứng chỉ xem lịch sử. Audit lưu thông tin media như ID, vị trí, ảnh bìa và dấu thay tệp. Đường dẫn, URL có chữ ký và tệp gốc nằm ngoài audit. Tệp đã mất cần tải lại. Nếu đường xóa dọn bảng con trước phòng, xem các sự kiện media/chi tiết trước sự kiện xóa.

## Áp dụng thủ công trên môi trường đã xác nhận

1. Dùng PostgreSQL staging có schema tương ứng hoặc bản sao đã loại bỏ dữ liệu nhạy cảm. So sánh lịch sử migration với repo và kiểm tra FK bằng câu lệnh chỉ đọc bên dưới. Xác nhận các bảng `rooms`, `room_details`, `room_media`, `room_lifecycle_audit` và RPC `is_admin_l1()` đã tồn tại. Dừng lại nếu phát hiện FK khác tên hoặc thiếu phụ thuộc.
2. Sao lưu trước khi thay đổi. Áp dụng riêng migration `20261107175109_room_audit_history.sql` bằng một giao dịch. Không dùng lệnh đẩy cả thư mục migration trong workspace đang có thay đổi khác.

   ```powershell
   if (-not $env:AUDIT_TARGET_DATABASE_URL) { throw 'Thiếu URL cơ sở dữ liệu đích' }
   psql $env:AUDIT_TARGET_DATABASE_URL -X -v ON_ERROR_STOP=1 --single-transaction --file supabase/migrations/20261107175109_room_audit_history.sql
   ```

3. Nếu dùng `psql` thành công, ghi phiên bản `20261107175109` vào lịch sử migration qua `supabase migration repair 20261107175109 --status applied "--remote=$env:AUDIT_TARGET_DATABASE_URL"`. Kiểm tra lại bằng `supabase migration list "--remote=$env:AUDIT_TARGET_DATABASE_URL"`. Các lệnh dùng cú pháp CLI v3 và chỉ nhắm đến URL đã dùng ở bước trước. Nếu hệ thống phát hành đã ghi phiên bản thì bỏ qua bước repair. [Tài liệu Supabase CLI](https://supabase.com/docs/guides/local-development/cli/migrating-to-v3)
4. Chạy smoke test bằng dữ liệu mẫu ở staging. Kiểm tra một lượt cập nhật qua giao diện và RPC, truy cập L1/L2, khôi phục có xung đột, nguồn duyệt Zalo qua fixture, hard-delete và các đường đọc phòng. Đo thời gian ghi, số sự kiện phát sinh mỗi ngày và thời gian lọc đếm chính xác khi dữ liệu tăng. Có thể chạy `supabase db advisors "--remote=$env:AUDIT_TARGET_DATABASE_URL"` trên staging được phép truy cập. Sau đó dùng cấu hình staging đã migrate cho `localhost:3000/reports/room-history`.

```sql
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.room_lifecycle_audit'::regclass and contype = 'f';
```

## Lưu trữ và dọn lịch sử

Đề xuất giữ ít nhất 365 ngày trong bảng báo cáo và rà soát dung lượng định kỳ. Chỉ quản trị DB được phép dọn, sau khi phê duyệt chính sách lưu trữ. Xem trước lô ứng viên, xuất bản sao mã hóa gồm các ID cần dọn và thử đọc lại. Xóa theo đúng ID đã duyệt và mốc thời gian cố định, từng lô nhỏ trong giao dịch, đối chiếu số dòng rồi mới commit. Loại trừ các vụ việc đang rà soát. Migration chưa bật job xóa.

```sql
select id, room_id, action, created_at
from public.room_audit_events
where created_at < now() - interval '365 days'
order by created_at, id
limit 500;
```

Nếu cần khôi phục tệp trong tương lai, cần chính sách giữ phiên bản hoặc cách ly tệp phía Storage/R2 theo thời hạn riêng. Kiểm tra chính sách xóa hiện có trước khi cam kết thời hạn cho media.

## Rollback

1. Gỡ đường dẫn báo cáo và thu hồi quyền gọi RPC khôi phục. Nếu cần ngừng ghi gấp, tắt đúng bốn trigger mới trong một giao dịch. Giữ bảng lịch sử, chỉ mục, dữ liệu và các trigger cũ để kiểm tra nguyên nhân.

   ```sql
   begin;
   revoke execute on function public.restore_room_audit_event_v1(uuid,text) from authenticated;
   alter table public.rooms disable trigger room_history_rooms_write;
   alter table public.rooms disable trigger room_history_rooms_delete;
   alter table public.room_details disable trigger room_history_details_write;
   alter table public.room_media disable trigger room_history_media_write;
   commit;
   ```

2. Hoàn tác phần giao diện và ngữ cảnh server bằng thay đổi có phạm vi tương ứng. Giữ nguyên các thay đổi khác đang có trong workspace. Không khôi phục FK `ON DELETE CASCADE` của lịch sử cũ khi còn bản ghi tham chiếu phòng đã xóa. Nếu cần thay đổi schema tiếp, tạo migration mới sau khi kiểm kê và sao lưu.
3. Nếu bật lại trigger sau một khoảng ngừng, rà soát các phòng đã sửa trong khoảng đó trước khi mở lại RPC. Audit không thể xác định các lần thay đổi rồi trả về giá trị cũ trong khoảng ngừng ghi.

## Kiểm thử offline

```sh
node --no-wasm-tier-up tools/admin/room-audit-sql.test.mjs
npx tsx tools/admin/room-audit-ui.test.ts
```

Test SQL dùng PGlite cục bộ ở `.zalo-reader/offline-sql-runtime/node_modules/@electric-sql/pglite` hoặc đường dẫn tuyệt đối qua `OFFLINE_SQL_RUNTIME`. Nếu chưa có runtime, cài `@electric-sql/pglite@0.5.13` vào một thư mục tạm bằng `npm install --prefix <thư-mục-tạm> @electric-sql/pglite@0.5.13` và trỏ biến môi trường vào thư mục package trong `node_modules`. Test giao diện dùng dữ liệu giả lập và kiểm tra HTML render cùng hành vi của server action, không cần đăng nhập hoặc gọi Supabase.
