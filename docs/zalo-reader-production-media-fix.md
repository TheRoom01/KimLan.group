# Kiểm tra nhãn TEST, ảnh và tên đường — 31/10/2026

Chỉ sửa code và chạy test offline. Không chạy Reader live, không đổi Windows Task Scheduler, không đổi phiên Zalo, không ghi/xóa database, không reset checkpoint hoặc sửa phòng chính/Pending hiện có.

## Kết quả kiểm tra dữ liệu thật (chỉ đọc)

Ba ví dụ đều được tạo bởi lượt `--trial`, run `816de5f7-7348-4cef-9d38-a8be9b20b941`. Pending có `is_test_import:true`; batch có `test_import:true` và `official_source.trial:true`. Nhãn TEST hiện tại là đúng. Code chạy chính thức không có `--trial`, dùng namespace riêng, không đặt các cờ TEST và vẫn bắt buộc duyệt thủ công. Trong workspace đang kiểm tra, `enabled:false`; truy vấn task theo tên đã cấu hình không trả về task. Không kết luận thay cho trạng thái máy/môi trường khác.

| Phòng | DOM/preview phát hiện | Tải/upload/DB | Tổng album từ nguồn | Kết luận |
|---|---:|---:|---|---|
| 162/13 Phan Đăng Lưu, 301 | 12 | 12 | Không có | Chưa chứng minh đủ album gốc |
| 170 Lý Tự Trọng, 302 | 1 | 1 | Không có | Chưa đủ bằng chứng nói thật sự thiếu ảnh |
| 458/50 Ba Tháng Hai, 103 | 1 | 1 | Không có | Chưa đủ bằng chứng nói thật sự thiếu ảnh |

Ảnh phát hiện đã đi hết pipeline download → upload → liên kết database. Source export cho 301 chứa 12 message ảnh riêng; hai phòng kia mỗi phòng chỉ có một message ảnh được ghép ở snapshot đã lưu. `groupLayoutId/totalImages` đều không có. Chưa đối chiếu live Zalo gốc hay mở viewer album; không khẳng định số ảnh gốc là 12/1/1 hoặc nguyên nhân thực tế là cuộn quá nhanh.

## Các lỗi code đã xác định và sửa

- Trước đây dùng thời gian chờ cố định, không quan sát `complete/naturalWidth/naturalHeight`, spinner và thay đổi media trước khi cuộn.
- Trước đây hydration chỉ nhận URL đầu tiên khi nhiều ảnh chung một message ID, vì đã đánh dấu message đó là assigned. Đã giữ toàn bộ ảnh có đúng một đích message ID xác minh, loại ánh xạ mơ hồ; thumbnail video vẫn nằm trong nhánh riêng. Đây là lỗi có thể gây thiếu ảnh, chưa chứng minh đã xảy ra ở ba ví dụ cụ thể.
- Trước đây `expectedImageCount:null` vẫn cho `complete:true`. Nay chỉ xác minh đủ khi có tổng nguồn và số ảnh thực khớp. Thiếu tổng/ảnh ẩn phía sau `+N`/timeout: `MEDIA_UNVERIFIED`; biết tổng nhưng thiếu: `MEDIA_INCOMPLETE`. Không tự bịa số ảnh hoặc sửa mã phòng từ metadata.
- Gallery Imports dùng toàn bộ media đã lưu; test offline đi đến ảnh thứ 12, không phát hiện cắt gallery còn 1 ảnh.

## Cơ chế chờ mới

Sau mỗi bước cuộn, lấy snapshot message ID, ảnh, trạng thái tải/spinner. Chờ không còn thay đổi ít nhất 750ms và không còn ảnh pending. Timeout mặc định 7 giây; tối đa một lần yêu cầu ảnh trong viewport tải eager/decode và chờ lại. Timeout được giữ theo message, chuyển thành cảnh báo của phòng. Blob fetch có timeout 8 giây. Không cuộn tiếp trước khi lần thu thập hiện tại kết thúc.

Placeholder, ảnh chưa có kích thước tự nhiên, thumbnail không có URL ảnh gốc và background chưa xác minh không được lưu thành ảnh phòng. Chỉ dùng URL gốc do UI cung cấp sẵn, không thay tham số URL, không lấy cookie/token. Không sử dụng thumbnail làm video.

Nút/overlay `+N` chỉ là bằng chứng album chưa thu thập đủ; không dùng số đó làm mã phòng. Chưa triển khai click viewer Zalo bằng selector đoán và chưa xác minh viewer thật; cần lượt live được người dùng cho phép khi lịch/Reader không chạy để kiểm tra giao diện album. Không vượt ranh giới tin nhắn/anchor để gom ảnh.

Log phòng phân biệt số phát hiện, download, submit, upload, DB, tổng metadata (có thể null), trạng thái xác minh và mã lỗi. Không coi tổng phát hiện là tổng album. Cảnh báo được lưu trong JSON diagnostics và hiển thị trên Imports; các nháp cũ không bị ghi lại.

## Nhãn và tên đường

`lifecycle.ts` là nguồn chung API/UI: TEST (cờ root/batch/trial), PRODUCTION_PENDING (nháp chính thức), PUBLISHED (đã duyệt và có ID phòng đã đăng). TEST cũ không được đổi thành production. Source canonical hóa đường vẫn nhận ra nháp TEST cũ để tránh tạo thêm chỉ vì khóa tên đường đổi.

`street.ts` chỉ nhận thành phần tên đường, quy 6 biến thể 3 Tháng 2 / 3/2 / Đường 3 Tháng 2 / Đường 3/2 / Ba Tháng Hai / Đường Ba Tháng Hai về `3 thang 2`. Dùng cho parser địa chỉ, nhận diện ranh giới, đối chiếu phòng/Pending và quyết định UPDATE/CREATE. Giữ nguyên biến thể tên đường cho hiển thị, không đổi số nhà, mã phòng hoặc ngày trống. Có hỗ trợ đọc khóa identity cũ mà không sửa chúng trong database. Khác số nhà/quận/mã phòng vẫn tách biệt; thiếu định danh cần xác minh.

Search keyword tổng quát hiện dùng RPC và `normalizeSearchKeyword`, không dùng khóa tên đường. Không thay toàn cục `3/2` trong chuỗi tìm kiếm vì có thể là số nhà, mã phòng hay ngày; mở rộng tìm kiếm địa chỉ qua RPC cần thay đổi riêng có kiểm soát.

## File chính

- `lib/rooms/street.ts`, `lib/zalo-import/parser.ts`, `room-comparison.ts`, `resolve.ts`, `tools/zalo-reader/parsers/utils.ts`: chuẩn hóa khóa đường và tương thích khóa cũ.
- `lib/zalo-import/lifecycle.ts`, `app/api/admin/zalo-imports/route.ts`, `app/admin/zalo-imports/ZaloImportsClient.tsx`: ba nhãn, khóa thao tác TEST, trạng thái album.
- `app/api/admin/zalo-imports/[id]/draft/route.ts`: đọc khóa identity cũ an toàn khi lưu nháp.
- `tools/zalo-reader/media-readiness.ts`, `zalo-reader.before-semantic-parser.ts`: chờ adaptive, lazy-load, placeholder, hydration nhiều ảnh cùng message, diagnostics.
- `tools/zalo-reader/parsers/media-matcher-v2.ts`, `semantic-timeline-v2.ts`: số ảnh thực và trạng thái album.
- `lib/zalo-reader/import-service.ts`, `media-report.ts`, `official-request.ts`: kiểm tra metadata, log và giữ dedupe nguồn cũ.
- Regression/API/UI tests và script `test:zalo-production-media` trong `package.json`.

## Nháp cũ và kiểm chứng tiếp

Không chạy lại Reader thông thường để mong tự sửa ảnh của nháp đã import: checkpoint/dedupe sẽ giữ nguyên nguồn cũ. Nếu đối chiếu live xác nhận thiếu ảnh, cần một thao tác retry/update có kiểm soát theo đúng sourceMessageId và Pending ID, được người dùng cho phép; không xóa lịch sử/checkpoint, không sửa album phòng chính. Lượt này chưa thực hiện cập nhật nào như vậy.

## Kiểm thử

PASS: regression nhãn production/TEST/published; API production không có cờ TEST và không tự publish; TEST cũ giữ nguyên; sáu biến thể tên đường và khóa cũ; adaptive/lazy load/placeholder; nhiều ảnh cùng message ID; album không rõ tổng; gallery đến ảnh thứ 12 và bố cục mobile (HTML/API giả, chặn mạng); parser smoke; 15/15 integration fixture; 22/22 định dạng tin; staging/transport; timestamp window; PostgreSQL transaction/RPC offline; TypeScript và `git diff --check`.

Không có kiểm thử Zalo live trong lượt này. Kết quả đầy đủ album gốc và cơ chế viewer “xem thêm” còn cần kiểm chứng được cho phép; các test offline không thay thế bằng chứng từ nguồn gốc.
