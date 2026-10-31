# Zalo Imports: nhận diện và duyệt cập nhật phòng

## File thay đổi trong đợt này

- `lib/zalo-import/room-comparison.ts`: khóa phòng, presence, snapshot và so sánh.
- `lib/zalo-import/resolve.ts`: tìm đủ ứng viên, kiểm tra Pending và chụp dữ liệu cũ.
- `lib/zalo-import/parser.ts`: giữ ngày thiếu năm để duyệt, đơn vị phí có bằng chứng và giá trị không còn áp dụng.
- `lib/zalo-reader/import-service.ts`: lưu metadata/snapshot/hash vào Pending và chặn Pending trùng.
- `lib/r2/zalo-temp.ts`: hash ảnh cũ trong bucket của đúng phòng, có giới hạn thời gian/dung lượng.
- `lib/zalo-import/update-pending-room.ts`: chuẩn bị media và gọi RPC duyệt UPDATE.
- `lib/zalo-import/publish-pending-room.ts`: bảo vệ CREATE khỏi UPDATE/phòng trùng.
- `app/api/admin/zalo-imports/[id]/approve/route.ts`: duyệt các trường được chọn, kiểm tra bản nháp cũ.
- `app/api/admin/zalo-imports/[id]/draft/route.ts`: bảo vệ snapshot khi lưu sửa, cấm tự duyệt UPDATE.
- `app/api/admin/zalo-imports/[id]/reparse/route.ts`: phân loại và chụp snapshot khi phân tích lại.
- `app/admin/zalo-imports/ZaloImportsClient.tsx`, `RoomUpdateComparison.tsx`: nhãn, so sánh và chọn trường.
- `supabase/sql/zalo-import-room-updates.sql`: RPC giao dịch và unique index, chưa áp dụng production.
- Các test mới `room-update-regression.test.ts`, `room-update-sql.test.ts`, `room-update-ui.test.ts`;
  cập nhật `test-pending-api.test.ts` và `zalo-import-integration-fixtures.test.ts` trong `tools/zalo-reader/parsers`.

## Triển khai

Code sử dụng JSON `room_payload._room_import`, giữ nguyên các bảng hiện có.
Trước khi dùng luồng mới trên môi trường triển khai, quản trị viên cần xem và áp dụng
`supabase/sql/zalo-import-room-updates.sql` bằng quy trình triển khai database của dự án.
Script tạo một unique index cho khóa phòng của Pending đang mở và RPC giao dịch
`approve_zalo_room_update_v1`. RPC chỉ cấp EXECUTE cho service_role, được gọi sau khi
API xác thực admin L1/L2. Không thêm cột/bảng và không cập nhật các Pending cũ.
Codex không chạy script này lên production.

Nếu RPC chưa được triển khai, duyệt UPDATE sẽ báo lỗi; code không chuyển sang ghi
REST riêng lẻ hoặc tạo phòng mới để né lỗi.

## Nhận diện và dữ liệu mới

Nguồn đã import/đã xử lý vẫn được chống trùng như cũ. Chỉ nguồn chưa xử lý mới
được so sánh thêm với bản nháp đang chờ duyệt, phòng hiện tại hoặc lịch sử import
đã xác nhận. Nếu mọi thông tin nguồn cung cấp giống nhau, API trả `noChanges=true`
và không tạo batch/Pending hay upload Storage. Reader ghi nhận nguồn đã kiểm tra,
thống kê riêng **không có thay đổi**, không báo nhầm đã tạo Pending.

Nếu có giá trị/ảnh khác, tiếp tục luồng UPDATE/CREATE hiện có. Nếu ảnh/video thiếu
hoặc chưa có hash để chứng minh bằng nhau, không tự kết luận trùng 100%; tiếp tục
kiểm tra/duyệt. Nguồn mới khác bản nháp đang mở vẫn giữ bảo vệ `ROOM_PENDING_EXISTS`,
không ghi đè bản cũ. Chế độ TEST chủ động vẫn giữ hành vi kiểm thử riêng.

Quy tắc nằm ở `lib/zalo-import/incoming-change.ts`, có regression
`tools/zalo-reader/parsers/incoming-change.test.ts` và test handler import thật.

Để chạy thử đúng bộ lọc nguồn mới mà vẫn chỉ tạo bản nháp TEST, có thể bật đồng
thời `testImportToPending: true`, `testNewSourcesOnly: true`,
`allowReimportForTesting: false` trong staging. Tùy chọn này lọc checkpoint trước
giới hạn 10 phòng, so sánh không đổi giống luồng chính thức và không cập nhật
Pending TEST đã có của cùng nguồn. Checkpoint không bị ghi trong chế độ TEST.
Khi bỏ/tắt `testNewSourcesOnly`, chế độ thử lại Pending cũ giữ nguyên hành vi cũ.

- Khóa gồm số nhà, đường, quận và mã phòng, không dùng giá/loại/ảnh/phường.
- Chuẩn hóa dấu tiếng Việt, hoa/thường, khoảng trắng, Q3/Quận 3 và P.L01/Phòng L01/L01.
  Giữ dấu phân cách hẻm và ký tự trong số nhà/mã phòng.
- Đúng một phòng còn hoạt động: UPDATE và chụp snapshot phòng/chi tiết/media.
- Hai tên đường cùng có dấu nhưng khác nhau dù bỏ dấu trùng nhau vẫn cần xác minh.
- Đủ khóa, không có phòng trùng: CREATE. Thiếu khóa, nhiều phòng hoặc phòng đã
  lưu trữ/xóa: NEEDS_REVIEW, không tự chọn đích hay tự tạo phòng mới.
- Kiểm tra Pending đang mở, kể cả dữ liệu cũ chưa có metadata. Nếu đã có Pending
  thường của cùng phòng, nguồn mới nhận HTTP 409 `ROOM_PENDING_EXISTS` trước tải
  media, không ghi đè bản cũ. Xử lý bản cũ rồi thử lại nguồn mới.
- Unique index ngăn hai request đồng thời tạo nhiều Pending thường cùng khóa.
  Dedupe nguồn Zalo giữ nguyên; TEST vẫn dùng danh tính test riêng.
- TEST mới được đọc phòng hiện tại để so sánh, luôn cấm duyệt/publish và không
  kế thừa dữ liệu từ phòng khác. Không chạy Reader live trong quá trình triển khai.

Presence được lưu riêng với giá trị: không có thông tin mới, có giá trị mới, hoặc
nguồn xác nhận xóa/không áp dụng. Đơn vị mặc định và giá trị kế thừa không được
coi là dữ liệu mới. False và 0 vẫn là dữ liệu hợp lệ. Ngày thiếu năm được giữ dưới
dạng ghi chú/cảnh báo; cần xác minh ngày đầy đủ, không tự đoán năm.

## Kiểm tra trên Imports

1. Dùng Pending mới hoặc **Phân tích lại** một Pending thường sau khi triển khai
   SQL. Tám Pending TEST hiện có được giữ nguyên và không tự backfill snapshot.
2. UPDATE có nhãn **CẬP NHẬT PHÒNG**, đường dẫn tới phòng đích và nút **So sánh &
   duyệt cập nhật**. Mở chi tiết để so sánh giá, loại, ngày, tiện ích và chi phí.
3. Giá trị khác màu xanh; trường thiếu ghi **Không có thông tin mới**. Checkbox
   ban đầu không chọn gì. Chỉ trường được chọn mới được áp dụng.
4. Album cũ/mới có số lượng riêng và xem toàn màn hình. SHA-256 so sánh byte ảnh;
   cùng số lượng hoặc URL khác không tự kết luận ảnh giống/khác. Nếu ảnh cũ không
   ở bucket/prefix của phòng hoặc không đọc/hash được trong hạn mức, hiển thị
   **Chưa xác minh nội dung ảnh** để người duyệt kiểm tra trực quan.
5. Thử sửa phòng chính sau lúc tạo snapshot: duyệt phải báo `ROOM_CHANGED`, giữ
   Pending để kiểm tra/phân tích lại. Phòng đích đã xóa/lưu trữ không được cập nhật.
   Nếu Pending thay đổi sau lúc mở giao diện, API báo `PENDING_CHANGED` và yêu cầu
   tải lại; không áp dụng giá trị chưa được người duyệt xem.
6. Từ chối Pending không thay đổi phòng chính. UPDATE không có đường tạo phòng
   mới; không có thao tác tự duyệt UPDATE.

Khi chấp thuận ảnh/video mới, service sao chép media được chọn rồi RPC thay danh
sách media đúng loại trong cùng giao dịch cập nhật. Media cũ không bị xóa khỏi
Storage; loại media không chọn được giữ nguyên. Nguồn media rỗng không xóa album.
Snapshot không chứa điện thoại/link Zalo riêng tư của phòng cũ.

## Kiểm thử offline

- `tools/zalo-reader/parsers/room-update-regression.test.ts`: khóa, presence, parser,
  phân trang và nhận diện Pending trùng.
- `tools/zalo-reader/parsers/test-pending-api.test.ts`: handler import thật với DB/
  Storage thay thế, UPDATE/CREATE, xung đột Pending, dedupe và bảo vệ TEST.
- `tools/zalo-reader/parsers/room-update-sql.test.ts`: SQL thật trên PostgreSQL
  in-memory PGlite; gồm HTTP approve thật, RPC, rollback và optimistic concurrency.
- `tools/zalo-reader/parsers/room-update-ui.test.ts`: React thật trên HTML fixture
  trong Chromium headless, không profile Zalo, không network.

SQL test tìm PGlite ở biến `OFFLINE_SQL_RUNTIME` hoặc
`.zalo-reader/offline-sql-runtime/node_modules/@electric-sql/pglite`.
Đã dùng PGlite 0.5.13 trong thư mục công cụ local (bị Git bỏ qua); không đổi
`package.json`/lockfile và không thêm dependency cho ứng dụng.
Chạy từng test bằng `node --import tsx <test-file>`, rồi `tsc --noEmit` và
`git diff --check`. Không cần thông tin đăng nhập Supabase cho các test này.
