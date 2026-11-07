# Audit Log và lưu trữ của The Room

Nhánh `feat/audit-retention-optimization`. Kết quả đối chiếu production chỉ đọc. Chờ duyệt kế hoạch trước khi triển khai. Chờ duyệt riêng giai đoạn B trước khi xóa lịch sử cũ.

## Giai đoạn A

| Nội dung | Kết quả |
| --- | --- |
| Bảng duy nhất của đợt dọn lịch sử | `public.owner_audit_logs` |
| Cutoff đã dùng để đo | `2026-11-08 04:48:50.863612+07` (Asia/Ho_Chi_Minh), tương đương `2026-11-07 21:48:50.863612+00`. Điều kiện `created_at < cutoff`. |
| Số dòng theo cutoff | 110.078 |
| Dung lượng đo được | 248.592.150 byte (~237,08 MiB) cho `old_data/new_data`. Bảng và index ~292,80 MiB. |
| Consumer, trigger, FK | Báo cáo kiểm toán ở thư mục cha tìm thấy các trigger ghi vào bảng và không thấy consumer nghiệp vụ trong app cũ. Production xác nhận 0 FK tham chiếu đến bảng và 0 trigger gắn trên bảng. Báo cáo mới chỉ liệt kê sự kiện có TTL. |
| Khôi phục | Trang lịch sử đọc `room_audit_events` và đường restore sử dụng các RPC của Room History. Restore từ thùng rác có nguồn vòng đời riêng. Các bảng này nằm ngoài cả hai lệnh dọn. |
| Bản sao lưu | Chưa tạo và chưa kiểm chứng khôi phục. Phiên làm việc có kết nối đọc metadata/tổng hợp qua Supabase, thiếu kết nối PostgreSQL trực tiếp và bộ công cụ `pg_dump/pg_restore`. |

Số dòng trên là trước khi đánh dấu hồ sơ cần giữ. Sau khi cập nhật các đánh dấu, chạy lại [dry-run](../supabase/sql/audit-retention-legacy-dry-run.sql) với `expires_at is null and not retention_hold` như hướng dẫn trong file. Nếu đổi mốc để phản ánh thời điểm dọn thực tế, cập nhật đồng thời hai file SQL, chạy lại dry-run và trình duyệt số liệu mới. Dung lượng JSON là số đo dữ liệu theo cutoff. Kích thước file PostgreSQL có thể giữ nguyên sau DELETE.

### Tạo và xác minh bản sao lưu

Chạy từ máy được cấp kết nối DB trực tiếp hoặc pooler chế độ session. Đặt tệp ngoài Git tại nơi lưu mã hóa có ACL hạn chế. Cấu hình tên dịch vụ PostgreSQL cho nguồn và máy thử khôi phục, lưu bí mật qua cấu hình kết nối của máy.

```powershell
pg_dump --format=custom --table=public.owner_audit_logs --strict-names --file="$auditBackupPath" "service=the_room_prod_backup"
Get-FileHash -Algorithm SHA256 -LiteralPath $auditBackupPath
pg_restore --list "$auditBackupPath"
pg_restore --exit-on-error --no-owner --no-privileges --dbname="service=the_room_audit_restore_test" "$auditBackupPath"
```

Dùng DB thử khôi phục cô lập có các schema/kiểu/bảng/hàm mà DDL của bảng cần, với bảng đích chưa tồn tại. Có thể dùng DB staging tương thích đã dựng sẵn rồi phục hồi riêng dữ liệu vào bảng trống bằng `pg_restore --data-only`. Ghi nhận thời điểm snapshot, SHA-256 và nơi lưu. Chạy lại dry-run trên DB thử, so khớp số dòng và mốc, kiểm tra một số ID ngẫu nhiên qua đối chiếu nội bộ. Chỉ coi là bản sao lưu đã kiểm chứng sau khi restore thành công.

## Triển khai sau khi được duyệt

| Thứ tự | Migration |
| --- | --- |
| 1 | [Audit nghiệp vụ và nguồn Zalo](../supabase/migrations/20261107220054_optimize_owner_audit.sql) |
| 2 | [Hoạt động khách và tài khoản Admin](../supabase/migrations/20261107220100_retain_customer_and_staff_audit.sql) |
| 3 | [Media và lịch sử mô tả phòng](../supabase/migrations/20261107220105_admin_room_media_and_description_history.sql) |
| 4 | [Lịch dọn và báo cáo](../supabase/migrations/20261107220110_schedule_audit_retention.sql) |

1. Xác nhận nơi lưu, khả năng restore và các hồ sơ phải giữ do điều tra hoặc nghĩa vụ lưu trữ. Áp dụng bốn migration theo thứ tự; đối chiếu lịch sử migration từ dự án Supabase. Workspace có các migration từ công việc trước nên rà danh sách cần áp dụng trước khi chạy lệnh đẩy migration hàng loạt.
2. Chạy canary trên staging cho Admin L1/L2, Owner/Manager, Customer Activity, Zalo Pending giả lập, Room History và restore. Sau khi áp dụng migration, triển khai web. Job được đăng ký với `cron.job.active=false` và cờ dọn `enabled=false`.
3. Đánh dấu `retention_hold=true` cho sự kiện phải giữ trong `owner_audit_logs`, `visitor_events`, `admin_staff_private.account_events` và `zalo_reader_runs` theo đối tượng. Đối với lượt cron, ghi `runid` vào `audit_retention_private.cron_run_holds`. Việc phê duyệt hồ sơ cần giữ thuộc người quản trị dữ liệu.
4. Xem `/reports/audit-retention` bằng Admin L1 và so khớp dry-run. Sau khi người dùng duyệt bật lịch, bật job trong Dashboard Cron và chạy `UPDATE audit_retention_private.state SET enabled = true WHERE singleton;`. Tắt job và đặt lại cờ `false` để dừng các lượt sau. Xác minh ngày kế tiếp qua báo cáo.

Lịch mặc định 03:17 giờ Việt Nam. Production đang dùng `cron.timezone=GMT`. Mỗi lượt xóa tối đa 1.000 dòng mỗi nguồn. Lượt Reader mới nhất mỗi nhóm, lượt Reader còn chạy hoặc gắn với Pending chưa kết thúc được bảo vệ. Cron giữ lượt đang chạy, lượt chưa có thời điểm kết thúc và lượt có giữ lại. Quyền cron phụ thuộc RLS của `cron.job_run_details`. Lần kiểm tra metadata thấy các job mà tài khoản `postgres` nhìn được đều chạy bằng `postgres`. Nhật ký dọn chỉ cập nhật một dòng tổng hợp, ghi số đã xóa hoặc mã SQLSTATE theo nguồn.

Room History, dữ liệu khôi phục, hồ sơ thuê/hợp đồng, tiêu chí nhận thông báo, yêu cầu tư vấn, phòng, tòa nhà, Pending và dữ liệu nguồn nhập được giữ theo vòng đời riêng.

Báo cáo khách hiện tổng hợp từ nhật ký còn trong 30 ngày. Chưa có bảng tổng hợp xu hướng dài hạn. Báo cáo Audit nghiệp vụ hiển thị 25 sự kiện mới nhất cho Admin L1, gồm chi tiết trước/sau của các trường được phép ghi.

## Giai đoạn B

Sau khi người dùng xác nhận kế hoạch và bản sao lưu đã thử phục hồi, dùng [lệnh xóa theo batch](../supabase/sql/audit-retention-legacy-delete-batch.sql). Chạy từng transaction và ghi nhận tổng số dòng đã xóa, mốc nhỏ nhất và lớn nhất. Ví dụ gọi bằng PostgreSQL client đã cấu hình dịch vụ cho tài khoản quản trị:

```powershell
psql "service=the_room_prod_maintenance" --variable=approved_verified_backup="$auditApprovalAndBackupReference" --file="supabase/sql/audit-retention-legacy-delete-batch.sql"
```

Dừng ngay nếu mã thoát khác 0, có timeout hoặc số liệu lệch phạm vi đã duyệt. Khi batch trả về 0, xác nhận bằng dry-run sau migration. Nếu vẫn còn dòng đủ điều kiện, kiểm tra lock trước khi tiếp tục. So sánh số bản ghi giữ lại, kiểm tra Room History và chức năng khôi phục trên staging, và ghi nhận thay đổi dung lượng. `VACUUM FULL` cần một kế hoạch và quyết định riêng.
