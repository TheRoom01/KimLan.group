# Dừng Zalo Auto Approve

## Phạm vi

- Route cũ `GET/POST /api/cron/zalo-auto-approve` dùng `CRON_SECRET` để nhận yêu cầu, chọn các Pending CREATE đã tới hạn và gọi `publishPendingRoom` với nguồn `draft_auto`. Nó từng chạy theo lô mặc định 10 phòng, tối đa 25. Ngay cả khi không có phòng đủ điều kiện, lần gọi hợp lệ vẫn truy vấn bảng Pending. Job theo tên do người dùng cung cấp cần được đối chiếu với cột `cron.job.command` trên Supabase.
- Đường nhập liệu cũ có thể publish CREATE ngay khi bật `ZALO_AUTO_IMPORT_ENABLED`, tắt `ZALO_AUTO_IMPORT_DRY_RUN` và đạt điều kiện chất lượng. Lưu nháp cũ có thể tự đặt lịch sau ba phút. Bản sửa loại bỏ cả hai khả năng và giữ route cron trả `410` để những caller cũ không chạy DB.
- Reader chính thức tiếp tục dùng `finalize_zalo_official_source_v1` để lưu Pending và media tạm. Admin L1 hoặc L2 được chỉ định tiếp tục duyệt tay qua API `approve`, dùng `admin_upsert_room_v3` để tạo mới hoặc `approve_zalo_room_update_v1` để áp dụng trường được chọn. Các quy tắc cho ảnh, video, địa chỉ và phòng trùng giữ nguyên.
- Không tìm thấy lệnh lập lịch job này trong các migration, SQL triển khai Reader hoặc cấu hình Vercel được lưu trong repo. Migration mới giữ nguyên cron email, dọn thùng rác và kích hoạt phòng đến ngày trống. Scheduler hay SQL nằm ngoài repo cần đối chiếu riêng nếu lịch xuất hiện lại.

## Trước khi gỡ lịch

Chạy dưới tài khoản sở hữu job hoặc có quyền xem và gỡ đúng job. Kiểm tra tên, ID, owner và đích gọi. Câu truy vấn hiển thị việc lệnh có chứa đường dẫn endpoint, giữ nội dung lệnh ngoài kết quả vì lệnh có thể chứa bí mật.

```sql
select jobid, jobname, schedule, username, database, active,
       position('/api/cron/zalo-auto-approve' in command) > 0 as calls_legacy_route
from cron.job
where jobname = 'zalo-auto-approve-every-minute';
```

Kỳ vọng đối với job được báo cáo là `jobid = 1` và `calls_legacy_route = true`. Mở cấu hình job trong Dashboard để xác nhận lệnh chỉ phục vụ Auto Approve. Nếu đường dẫn nằm trong hàm wrapper hoặc job chạy lệnh khác, xác minh hàm trước khi gỡ lịch. Lưu riêng cấu hình đầy đủ của job nếu cần đường rollback. Đối chiếu với danh sách Cron trên Dashboard nếu tài khoản truy vấn thấy 0 dòng.

## Gỡ và xác nhận

Áp dụng riêng [migration `20261107192524`](../supabase/migrations/20261107192524_disable_zalo_auto_approve.sql) sau khi đối chiếu. Migration gọi `cron.unschedule` theo ID của job đã khớp tên và kiểm tra đích. Chạy lại khi job đã vắng mặt là an toàn. Lệnh này gỡ lịch chạy và giữ lịch sử. [Hướng dẫn Cron của Supabase](https://supabase.com/docs/guides/cron/quickstart)

```sql
select not exists (
  select 1 from cron.job where jobname = 'zalo-auto-approve-every-minute'
) as unscheduled;

select jobid, jobname, schedule, active
from cron.job
where jobname in ('owner-email-outbox-worker', 'purge-owner-trash-daily', 'activate-due-room-availability')
order by jobname;

select max(start_time) as last_run
from cron.job_run_details
where jobid = 1; -- Thay bằng ID thu được ở bước kiểm tra nếu khác.
```

Kỳ vọng `unscheduled = true`. Sau vài chu kỳ, đối chiếu lần chạy gần nhất trong `cron.job_run_details` của ID cũ. Lịch ngừng kích hoạt mới ngay khi được gỡ, còn HTTP đã gửi trước đó có thể vẫn đang xử lý. Việc gỡ lịch không thu hồi dung lượng từ lịch sử đã có. [Hướng dẫn kiểm tra pg_cron](https://supabase.com/kb/troubleshooting/pgcron-debugging-guide-n1KTaz)

Nếu một Pending vẫn báo đang xử lý sau khi phiên bản cũ đã ngừng nhận yêu cầu và các lượt chạy cũ đã kết thúc, kiểm tra `auto_approve_processing_at` của đúng Pending đó. Có thể gỡ khóa cũ sau ít nhất 10 phút bằng câu lệnh sau. Thay UUID mẫu bằng ID đã kiểm tra. Migration chính giữ nguyên toàn bộ Pending.

```sql
update public.pending_room_versions
set auto_approve_enabled = false,
    auto_approve_at = null,
    auto_approve_actor_id = null,
    auto_approve_processing_at = null
where id = '00000000-0000-0000-0000-000000000000'::uuid
  and status = 'Chờ duyệt'
  and auto_approve_processing_at < now() - interval '10 minutes'
returning id;
```

## Khôi phục nếu thay đổi chính sách

Khôi phục phiên bản code trước khi chặn tự duyệt, sau đó chỉ tạo lại đúng job từ bản cấu hình đã lưu, cùng owner, database, lịch và lệnh gốc. Kiểm tra trên môi trường thử nghiệm với Pending giả lập trước. Tạo lại lịch trong khi endpoint vẫn trả `410` chỉ làm phát sinh lượt chạy. Nếu cần quản lý thay đổi bằng migration, tạo migration mới để lịch sử triển khai vẫn phản ánh đúng thao tác.
