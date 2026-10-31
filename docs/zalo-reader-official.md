# Zalo Reader chạy chính thức trên Windows

Trạng thái: hai file SQL đã triển khai sau xác nhận của người dùng ngày 31/10/2026; **chưa cài/bật lịch**. Lượt live bổ sung được cho phép sau bản sửa timestamp/24 giờ đã hoàn tất hai nhóm: tạo 7 Pending TEST mới, 31 ảnh, không có video; 3 nguồn thiếu media hợp lệ không tạo nháp. 8 Pending TEST cũ giữ nguyên. Chi tiết: `docs/zalo-reader-live-trial-2026-10-31.md`.

Quy tắc mới nhất: mỗi lượt chỉ đọc tin trong **24 giờ gần nhất**; đọc Q1/Q3/Q10 rồi PN/BT/TB theo thứ tự, kết thúc và đóng Reader. Lượt kế tiếp bắt đầu **60 phút sau khi toàn bộ lượt trước kết thúc**, không tính từ lúc mở nhóm đầu. Tin tồn đã quá 24 giờ không được kéo vào lượt mới. Chỉ bật sau kiểm thử live thành công và xác nhận cuối cùng.

## File và cấu hình

- `tools/zalo-reader/official.config.json`: `enabled:false`, `maxLookbackHours:24`, `runGroupsSequentially:true`, `intervalFromCompletion:true`, đúng hai nhóm, cùng profile `.zalo-reader/profile`. Không sửa config legacy.
- `official-runner.ts` và `official-runtime.ts`: gọi lại Reader/parser hiện tại một lượt, khóa PID nguyên tử, checkpoint và log riêng từng nhóm.
- `lib/zalo-reader/official*.ts`: chọn nguồn cũ nhất chưa xử lý, xác minh receipt, định danh nguồn theo group ID + message ID + mã định danh phòng (một tin nhiều phòng).
- `supabase/sql/zalo-reader-official.sql`: hai bảng vận hành, RPC nhận trạng thái và RPC ghi batch/Pending/media trong cùng giao dịch; không ghi bảng phòng chính.
- API trạng thái nội bộ và Admin; `app/admin/ZaloReaderStatus.tsx`; bộ lọc nhóm/CREATE/UPDATE/NEEDS_REVIEW/thời gian đọc/trạng thái ở Imports.
- `scheduler.ps1`, `scheduled-run.ps1`: cài, bật, tắt, chạy một lượt, xem trạng thái.

Nhóm Q1/Q3/Q10 có ID `g1986619726266954037`. Nhóm PN/BT/TB đã xác minh ID `g6674917926513771782` qua duy nhất một kết quả đúng tên, header đúng và `dom_message_id`, lưu vào config/registry. Không dùng ID giả trong fixture cho môi trường thật. Nhiều kết quả đúng tên: dừng riêng nhóm đó, báo `GROUP_NAME_AMBIGUOUS`, cần người dùng xác nhận; nhóm còn lại tiếp tục.

ID xác minh được lưu trong `.zalo-reader/official/verified-groups.json` và registry server; lần sau ID khác bị từ chối. Checkpoint chính thức và trial tách biệt. Không xóa hoặc thay đổi `tools/zalo-reader/state.json`.

## Chuẩn bị trước lượt live được phép

1. Hai file `supabase/sql/zalo-import-room-updates.sql` và `supabase/sql/zalo-reader-official.sql` đã áp dụng theo xác nhận của người dùng. API/Admin phải chạy cùng phiên bản code; kiểm tra readiness trước lượt live, không tự áp dụng lại SQL.
2. Máy Reader và server dùng cùng `ZALO_READER_INTERNAL_SECRET` qua môi trường/`.env.local`. Không đặt secret vào JSON, task arguments hoặc log. Đặt `ZALO_READER_WEB_BASE_URL=https://<website>` trên máy chạy chính thức. Server cần cấu hình Supabase/R2 đang có của Imports.
3. Trial mặc định gọi `http://127.0.0.1:3000`; chạy Next.js local cùng code, kết nối database mong muốn. Có thể đặt `ZALO_READER_STAGING_API_URL` thành origin được triển khai. API phải vượt kiểm tra readiness; không tự áp dụng SQL khi thiếu.
4. Đóng Reader/Chrome đang giữ **đúng profile Reader** bằng thao tác thông thường. Script không đóng Chrome khác hoặc xóa lock/profile.
5. Xin phép người dùng trước lượt live. Sau khi được phép:

```powershell
npm run zalo-reader:official -- --trial
```

Trial đọc đúng hai nhóm, tối đa **10 Pending TEST mới tổng cộng**, dành tối đa 5 phòng/5 nguồn cho mỗi nhóm để nhóm đầu không dùng hết lượt thử. Không duyệt/publish, không sửa phòng chính/Pending thật/8 TEST cũ. Nguồn trial có ID ổn định riêng: chạy lại không ghi đè nháp đã có. Trial không cập nhật checkpoint chính thức. Kết quả tại Imports mang nhãn TEST và không publish được.

Kiểm tra nhóm, CREATE/UPDATE/NEEDS_REVIEW, ảnh/video, trường xanh và giá cũ → mới tại `/admin/zalo-imports`. Nếu nhóm 2 trùng tên, cần xác nhận nhóm trước khi tiếp tục. Chỉ khi cả hai nhóm được xác minh, quét đến đúng ranh giới (`coverageComplete`), không có lỗi xử lý và người dùng đã xem Pending/xem cảnh báo mới được bật lịch. Các tin ngoài budget hoặc media chưa có anchor vẫn có thể báo `needs_review`; không được đánh dấu xong và phải giữ cho lượt sau/kiểm tra. Không chỉnh tay báo cáo để vượt điều kiện này.

## Kiểm thử offline, không mở Zalo hoặc ghi dữ liệu thật

```powershell
npm run test:zalo-official
npm run test:zalo-official:sql
npm run test:zalo-official:ui
npm run zalo-reader:official:fixture
npm run test:zalo-parser
npm run test:zalo-staging
npx tsc --noEmit --incremental false
git diff --check
.\tools\zalo-reader\parsers\official-scheduler.test.ps1
```

Fixture hai nhóm sử dụng dữ liệu giả và ID nhóm 2 giả **chỉ trong thư mục fixture tách biệt**. Nó chạy cùng semantic parser/checkpoint/selector, mô phỏng receipt; `networkCalls:0`, `browserLaunched:false`, `pendingWrites:0`. Báo cáo fixture không đủ điều kiện bật production. Các test API dùng DB/Storage giả; `official-sql.test.ts` và `room-update-sql.test.ts` dùng PGlite PostgreSQL trong bộ nhớ tại `OFFLINE_SQL_RUNTIME` (công cụ test có sẵn, không thêm dependency ứng dụng).

## Cài/bật/tắt lịch (chỉ sau xác nhận)

Các lệnh dưới đây chưa được thực thi trong giai đoạn code. Chạy bằng **tài khoản Windows đang có profile Zalo** tại thư mục dự án:

```powershell
# Cài task ở trạng thái TẮT; chưa chạy Reader
.\tools\zalo-reader\scheduler.ps1 -Action Install

# Xem thông tin task
.\tools\zalo-reader\scheduler.ps1 -Action Status

# Chỉ sau live trial thành công, xem Pending và xác nhận cuối cùng
.\tools\zalo-reader\scheduler.ps1 -Action Enable -Confirmed

# Chạy thủ công một lượt chính thức khi đã bật cấu hình
npm run zalo-reader:official

# Tắt các lượt tương lai; lượt đang chạy được kết thúc an toàn
.\tools\zalo-reader\scheduler.ps1 -Action Disable
```

Task chỉ chạy khi tài khoản cài task có phiên đăng nhập Windows tương tác, quyền thường, không SYSTEM/S4U hoặc mật khẩu lưu trong script. Sau mỗi lượt hoàn tất, wrapper đặt lại trigger cho 60 phút sau; `cycle-state.json` chặn việc mở Reader sớm hơn kể cả có trigger trùng. `StartWhenAvailable` tiếp tục sau khi máy hoạt động lại, không đánh thức máy. Wrapper ẩn, Chrome có UI thông thường trong phiên người dùng. Không cần mở terminal mỗi giờ. Wrapper chạy chồng chỉ kiểm tra khóa Node, ghi log rồi thoát; không mở Reader thứ hai hoặc đổi lịch của lượt còn đang chạy. Không cưỡng bức kết thúc Chrome; tắt lịch trong lúc đọc sẽ không bị wrapper tự bật lại.

Thiết lập dựa trên tài liệu chính thức Microsoft: [trigger lặp](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtasktrigger), [settings / StartWhenAvailable / MultipleInstances](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtasksettingsset), [Interactive principal](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtaskprincipal).

## Checkpoint, lỗi và vận hành

- Mỗi lần bắt đầu nhóm: chốt cửa sổ tối đa 24 giờ kết thúc tại thời điểm bắt đầu nhóm đó. Checkpoint/overlap giúp tránh đọc trùng nhưng không bao giờ mở rộng ra ngoài 24 giờ. Nguồn mới đến sau mốc chốt chờ lượt sau. Xử lý cũ → mới trong cửa sổ hợp lệ.
- Text đã xác minh chỉ được dùng làm ngữ cảnh khi còn trong 24 giờ; không lấy ảnh/video cũ từ cache hay truyền ngược thông tin phòng. Index timestamp hỗ trợ đúng kiểu số hoặc chuỗi số mà Zalo lưu; không dùng DOM order thay timestamp/ID đáng tin cậy. Metadata ID/thời gian của một tin ngay trước cửa sổ chỉ dùng làm điểm dừng cuộn, không đọc nội dung hay tải media của tin đó.
- Chỉ receipt Pending thực có ID, nguồn đã có Pending hoặc so sánh chắc chắn UNCHANGED mới được đánh dấu xử lý. Batch không có Pending phải kiểm tra thủ công, không tự tái tạo nháp đã xóa. Một tin nhiều phòng: chỉ ack nguồn sau khi tất cả phòng trong tin có receipt.
- Watermark không vượt qua tin thất bại, chưa có nội dung xác minh, media thiếu anchor hoặc nguồn quá giới hạn. Các ID đã xử lý vẫn được lưu để không lặp Pending. Sau khi máy nghỉ nhiều giờ/ngày, chỉ đọc phần tồn còn nằm trong 24 giờ gần nhất, theo yêu cầu mới; không quét bù các ngày cũ. Log ghi số lượt bị lỡ.
- Giới hạn mặc định **10 nguồn message / 20 phòng mỗi nhóm mỗi lượt**; không chia đôi tin nhiều phòng để vượt budget. Lượt sau xử lý phần còn lại. Giới hạn quét DOM tăng khi chưa đến ranh giới; nếu vẫn thiếu lịch sử, cảnh báo và giữ watermark. Nguồn không có bằng chứng/anchor cần kiểm tra; không tự bịa phòng hay đánh dấu xong để vượt qua.
- Ảnh thành công nhưng video lỗi: Pending có cảnh báo. Video-only không tải được hoặc media dự kiến nhưng không có file hợp lệ: không tạo Pending rỗng, giữ để retry. Không mở video để vượt xác thực hoặc tự tạo URL. Lỗi ảnh/API không làm mất checkpoint nhóm còn lại.
- Cùng nguồn: dedupe riêng theo group ID + message ID + phòng trong tin. Tin mới của cùng phòng đi qua so sánh database toàn cục; không ghi đè Pending đang chờ. Có thay đổi và đã có Pending thật thì báo xung đột để admin xử lý trước, không nhân bản/ghi đè. Không thay đổi chống trùng phòng chính.
- Lỗi API sau upload chưa xác nhận commit: không tự xóa media đã upload vì giao dịch có thể đã thành công; lần retry tra Pending để khôi phục receipt. Có thể còn media tạm mồ côi để dọn bằng quy trình hiện có sau kiểm tra.
- Nháp từ Reader chính thức giữ cờ bắt buộc duyệt thủ công qua lưu chỉnh sửa/phân tích lại; cron hoặc đường publish tự động bị chặn. Chỉ thao tác duyệt rõ ràng của admin mới được xuất bản phòng thật. TEST không được publish kể cả thủ công.
- Phiên Zalo hết hạn: chờ UI đăng nhập tối đa 120 giây rồi báo `LOGIN_REQUIRED`, không vượt xác thực. Người dùng đăng nhập lại qua UI thông thường sau khi được phép.
- `/admin` và Imports hiển thị trạng thái từng nhóm, lần quét, lịch bật/tắt, Pending mới và cảnh báo hơn 2 giờ không có heartbeat/lượt quét. Không có nút web thực thi lệnh Windows từ xa.
- Log `.zalo-reader/official/logs/<runId>.jsonl`, `runs/<runId>.json`, `console/`, `failures.jsonl`, `skipped-runs.jsonl`; gồm mốc cửa sổ, số tin/phòng/CREATE/UPDATE/Pending, lý do skip, lỗi media theo nguồn. Không ghi URL token/cookie/mật khẩu. Checkpoint `.zalo-reader/official/checkpoints/<groupKey>.json`; trial nằm trong `trials/<runId>/`.

## Cần xác nhận để bật chính thức

1. SQL đã triển khai, lượt live hai nhóm đã chạy; 7 Pending TEST được xác nhận trong database, không tự chạy thêm lượt.
2. Người dùng kiểm tra 7 nháp trên Imports; xem 3 nguồn bị chặn vì media thiếu và cảnh báo thiếu video. Công cụ UI không xác định được URL nên Codex đã dừng điều khiển giao diện, chưa xác nhận trực quan trang Imports.
3. Xác nhận lần cuối để cài/bật lịch mỗi 60 phút. Chưa có xác nhận này thì giữ `enabled:false` và task tắt/chưa cài.
