# Zalo Reader production một lượt

## Trạng thái chuẩn bị

Lệnh production mới dùng `tools/zalo-reader/production.config.json`, tách khỏi config local test. `npm run zalo-reader` vẫn là lệnh local test cũ; thay đổi cờ ở đó không điều khiển production.

```powershell
npm run dev
# Trong cửa sổ PowerShell khác, tại thư mục dự án:
npm run zalo-reader:production
```

Reader in rõ phạm vi và yêu cầu gõ `PRODUCTION`. Khi Codex đã nhận xác nhận một lượt trong chat, có thể chạy `npm run zalo-reader:production -- --confirm-production` để không hỏi lần hai trong terminal. Cờ này không bật lịch tự động.

## Phạm vi

- API `http://127.0.0.1:3000` chạy bản code hiện tại, **kết nối Supabase production** `vgmtiymubuwztqdxsexn`; đây là Pending chính thức, không phải TEST LOCAL hay Pending TEST.
- Imports: `http://localhost:3000/admin/zalo-imports`. Cần đăng nhập admin như bình thường.
- Website public hiện chuyển sang `www.canhodichvu.pro`, nơi endpoint `/api/internal/zalo-reader/status` trả 404 lúc kiểm tra. Chưa triển khai bản code này lên website. Không dùng host CDN làm API.
- Env riêng `ZALO_READER_PRODUCTION_API_URL`, nếu có, phải trùng origin trong production config. Cấu hình/env legacy về test và API legacy không điều khiển production. Các cờ test trong production config, env config/profile xung đột, hoặc tham số `--trial`/`--fixture` làm lệnh dừng rõ ràng.
- Đúng hai nhóm Q1/Q3/Q10 (`g1986619726266954037`), sau đó PN/BT/TB (`g6674917926513771782`), cùng profile `.zalo-reader/profile`.
- Chỉ trong 24 giờ; giữ checkpoint và chống trùng. Tối đa 10 message nguồn / 20 phòng mỗi nhóm, tối đa 40 Pending một lượt nếu một message có nhiều phòng. Không có đảm bảo đủ 40 phòng.
- Một lượt rồi dừng. `enabled:false` của scheduler không chặn lệnh production thủ công đã xác nhận. Không thay đổi Windows Task Scheduler.
- Pending CREATE/UPDATE chính thức không mang cờ test, `auto_approve_enabled=false`, bắt buộc admin duyệt. Thiếu khóa nhận diện hoặc xung đột cần xác minh; không ép thành CREATE/UPDATE.
- Cùng nguồn chạy lại trả receipt cũ, không sửa Pending đã được admin chỉnh. Tin mới của phòng cũ so sánh với dữ liệu hiện có; giữ các quy tắc xung đột Pending.

## Sửa media

Đối chiếu preview cũ/mới: nguồn `8433196648441` có 7→4 ảnh; `8433159888012` có 14→0; `8433051870338` có 8→0. Snapshot mới không chứa nhiều ID ảnh cũ. Không đủ dữ liệu để khẳng định một nguyên nhân live duy nhất.

Các lỗi được tái hiện bằng fixture và sửa trong vòng capture hiện có: cache theo vị trí ảnh gây dùng lại nhầm ảnh khi DOM đổi; chỉ chọn snapshot dài hơn gây mất các phần album khác nhau; dừng sau sáu viewport không có ID mới dù vẫn cuộn qua cùng album. Bây giờ lưu blob mỗi lần poll khi còn trong viewport, định danh file bằng hash nội dung theo message, hợp nhất các phần đã lưu, không dừng chỉ vì lặp ID trong lúc còn di chuyển. Cuộn chồng lấn tối đa 45% viewport; production cho phép 200 bước, không dùng giới hạn 20 bước của local test. Không pre-scroll nhanh trong đường official/production.

Chờ ảnh nhìn thấy tải xong, retry giới hạn; nếu vẫn tải dở thì giữ cảnh báo và dừng cuộn nhóm, không cuộn bỏ ảnh đang tải. Ảnh lazy nằm ngoài viewport không chặn cuộn. Không suy ra album đầy đủ từ số ảnh đã đọc. Album không rõ tổng số là MEDIA_UNVERIFIED; thiếu so với tổng đã xác minh là MEDIA_INCOMPLETE. Không tạo Pending không có media hợp lệ. Payload quá lớn được báo lỗi theo phòng, giữ file local để xử lý lại, không loại toàn bộ ảnh để gửi Pending rỗng.

Ngoại lệ theo yêu cầu mới: phòng có anchor đủ loại + giá + mã, kèm ID message video được Reader nhận diện nhưng chưa tải được video, vẫn tạo Pending production với `VIDEO_MANUAL_UPLOAD_REQUIRED` / `_manual_video_required`. Không giả lập ảnh/video đã lưu, không tự publish; media trống không có bằng chứng video vẫn bị chặn. Mở Chỉnh sửa → thêm video → Lưu nháp rồi Duyệt đăng. Bản thiếu video không tạo phòng/tòa nhà chính trước khi được bổ sung media và duyệt.

Album chính giữ nguyên khi duyệt UPDATE các trường chữ/số. Chỉ thay ảnh khi admin chủ động chọn “Áp dụng album ảnh mới” và xác nhận duyệt; UI hiển thị cảnh báo nếu chưa xác minh đủ ảnh. Import không tự thay media phòng chính.

Khi duyệt CREATE, Imports dùng `admin_upsert_room_v3` với phiên admin giống `/admin` → Thêm phòng: tự gắn tòa nhà khớp duy nhất, nhiều kết quả thì chọn trong modal chỉnh sửa, chưa có thì RPC tạo tòa nhà theo cơ chế Admin hiện có. Không thêm schema hoặc tạo tòa nhà tại bước Reader import. Modal lưu `property_id` đã chọn vào Pending; Duyệt đăng chuyển lựa chọn đó vào RPC.

Regression bổ sung cho yêu cầu video thủ công/tòa nhà: fixture 402/503 tạo Pending production thiếu video với cảnh báo và ID nguồn; thiếu anchor hoặc thiếu bằng chứng video vẫn bị chặn; đọc lại không ghi đè nháp. `import-property-publish.test.ts` chạy handler lưu nháp và duyệt thật với DB/Storage giả: thêm video, không auto-publish, chuyển đúng phiên admin vào RPC, khớp/chọn tòa nhà, chưa có media thì không tạo phòng chính. UI, SQL offline, parser/integration, staging/transport, TypeScript và `git diff --check` PASS. Chỉ đọc metadata RPC production để xác nhận tồn tại/quyền gọi; không chạy Reader, import hay sửa dữ liệu thật để thử.

## Kiểm chứng trước/sau lượt được phép

Test offline gồm config production và xung đột, vòng capture thật với 14 ảnh ở cùng chỉ số DOM, timeout không cuộn, parser, 15 integration fixtures, 22 listing formats, staging/transport, cửa sổ timestamp, API mock CREATE/UPDATE không TEST, chống ghi đè chỉnh sửa, không auto-publish, SQL PostgreSQL offline, UI nút duyệt và so sánh màu, TypeScript, `git diff --check`.

Readiness GET và kiểm tra registry Supabase đều chỉ đọc; không ghi phòng giả để thử. Trước lượt thật phải xin xác nhận người dùng, ghi baseline Pending/phòng chính; sau lượt phải đối chiếu run report và database về CREATE/UPDATE, ảnh, cảnh báo, skip, cờ TEST và trạng thái chờ duyệt. Chưa được coi là hoàn tất production trước khi lượt được cho phép tạo Pending thật và được xác minh.

Kết quả chuẩn bị 31/10/2026: tất cả các bộ test nêu trên PASS, bao gồm UI headless với mạng bị chặn và scheduler `-WhatIf`/mock. TypeScript và `git diff --check` PASS. GET API local trả 200/`ready:true`, đúng project Supabase. Kiểm tra không có tiến trình Reader/profile đang chạy, không có task Windows, không có checkpoint production sẵn có; hash checkpoint legacy vẫn `7A4D5A6EFF2D4FC46FF8DBCD80A881175F0CAECD13F27182B0169656EDE14891`. Database có 0 Pending ở thời điểm kiểm tra. Chưa chạy production; đang chờ xác nhận lượt đầu.
