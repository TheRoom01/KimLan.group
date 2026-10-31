# Zalo Imports — tối ưu thao tác và media

Thay đổi ngày 31/10/2026:

- Lưu nháp, duyệt trong form và duyệt/từ chối/xóa trong chi tiết đóng modal ngay sau kiểm tra dữ liệu và xác nhận hiện có. RPC nhận diện tòa nhà chạy sau khi đóng modal.
- Toast xếp dọc, căn giữa ngang tại 35vh; ghi thao tác, mã phòng, bước đang chạy và kết quả. Không có backdrop. Thành công tự tắt sau 5 giây; lỗi chờ admin đóng.
- Trạng thái và khóa theo pending ID nằm ngoài modal. Không gửi trùng tác vụ trên cùng import trong phiên trang. Có thể thao tác import khác.
- Lưu nháp lỗi giữ snapshot form trong bộ nhớ; toast có nút mở lại chỉnh sửa. Nếu đã lưu nháp nhưng duyệt lỗi, mở lại bản đã lưu. Không tự retry thao tác duyệt.
- Không refetch toàn danh sách khi duyệt thành công; cập nhật/xóa đúng thẻ. Kết quả cũ không mở lại modal hoặc đóng modal của import khác. Hủy request danh sách cũ khi đổi bộ lọc.
- Ghi thứ tự media chỉ cho vị trí đổi, tối đa 4 truy vấn đồng thời. Không thay schema, quyền hoặc chính sách tự duyệt.
- Copy R2 khi đăng: tối đa 3 ảnh hoặc 2 video đồng thời. Chờ mọi công việc đang chạy kết thúc trước rollback. Thứ tự và bìa được chuẩn hóa sau khi copy.
- Upload giữ direct PUT R2 và nén ảnh hiện có; hiển thị tiến trình byte, giữ file thành công ngay khi xong, bảo toàn thứ tự chọn. Retry tối đa 2 lần cho lỗi mạng/429/5xx; phát hiện kết nối không có tiến triển trong 60 giây. Lỗi 4xx không retry tự động. Fallback server nhỏ hiện có được giữ.

## Kiểm chứng

- `node --require tsx/cjs tools/performance/zalo-import-performance.test.ts`
- `node --require tsx/cjs tools/zalo-reader/parsers/import-property-publish.test.ts`
- `node --require tsx/cjs tools/zalo-reader/parsers/pending-modal-approve-ui.test.ts`
- `node node_modules/typescript/bin/tsc --noEmit --pretty false --incremental false`

Các kiểm thử dùng dữ liệu giả/offline. Chưa đo latency hoặc throughput production, chưa xác minh CORS/codec thực tế. Tác vụ chạy tiếp khi modal đóng trong trang đang mở; chưa có durable job theo dõi qua reload/đóng tab. Multipart/resume video lớn chưa triển khai trong lượt này.

## Chạy thủ công, đọc lại bản đã xóa và chọn vị trí trước

- `npm run zalo-reader:production` là chạy thủ công: không chờ 60 phút và không dời lịch tự động. Wrapper Task Scheduler truyền `--scheduled`; chỉ chế độ này kiểm tra/lưu thời điểm chạy tiếp theo. Khóa chống hai Reader chạy đồng thời vẫn giữ.
- Trước mỗi nhóm, Reader đối chiếu receipt với API nội bộ bằng secret hiện có. Receipt mới ghi tất cả Pending ID của từng nguồn; thiếu một Pending thì đọc lại nguồn đó, kể cả nguồn có nhiều phòng. Server tiếp tục chống trùng cho các phòng còn tồn tại và bị từ chối. Checkpoint cũ chưa có Pending ID được đối chiếu lại một lần để bổ sung metadata; không xóa toàn bộ checkpoint.
- Nguồn đọc lại vẫn nằm trong giới hạn 24 giờ và hạn mức nguồn/phòng đã cấu hình. Phòng đã xóa được tạo lại bằng dữ liệu/media đọc mới; không phục hồi ảnh cũ từ imports. Lỗi đối chiếu server chặn lượt đọc thay vì bỏ bảo vệ chống trùng.
- Tab Vị trí của imports không cần property ID. Tìm `Hẻm <số nhà đầu tiên> <Đường>, <Phường>`; nếu không có kết quả mới tìm `<Đường>, <Phường>`. Ví dụ `125/4/30` dùng `Hẻm 125`. Quy tắc chỉ dùng cho định vị, không sửa địa chỉ thật để nhận diện tòa nhà.
- Gợi ý tọa độ là gần đúng, admin có thể chọn kết quả hoặc kéo ghim. Tọa độ lưu vào `_pending_location` trong room payload của nháp; chưa ghi vào properties lúc lưu nháp. Khi duyệt thành công, dùng RPC quyền admin hiện có để ghi vị trí dùng chung của tòa nhà. Nếu ghi vị trí lỗi, báo rõ phòng đã duyệt nhưng vị trí chưa lưu; không báo duyệt thất bại hoặc rollback phòng đã đăng.
- Cần triển khai API `/api/internal/zalo-reader/receipts` cùng bản Reader mới. Không cần migration. Chưa chạy Reader live hoặc deploy trong lượt thay đổi này.

Kiểm thử bổ sung: `tools/zalo-reader/parsers/manual-replay-location.test.ts`, `tools/zalo-reader/parsers/import-location-ui.test.ts` và bộ scheduler mock hiện có.

## Media trong modal chi tiết imports

- Thumbnail vuông, bo góc, nút bỏ media ở góc trên phải theo modal phòng `/admin`; giữ kéo thả desktop, phím mũi tên và tay nắm kéo trên điện thoại.
- Kéo đổi thứ tự và bỏ media chỉ đổi state cục bộ. Không gọi API, không đóng modal và không tạo toast riêng. Đóng modal mà chưa lưu sẽ bỏ các thay đổi cục bộ.
- Nút Lưu bản nháp lưu thay đổi media. Duyệt/Đăng lưu media trước, sau đó duyệt bằng payload server vừa trả về; chỉ có toast tác vụ chung. Lưu media lỗi sẽ không gọi API duyệt.
- Mở Chỉnh sửa mang theo thứ tự và danh sách media cục bộ, cùng ID gốc để nhận biết media bị bỏ. Lưu/duyệt trong form chỉnh sửa lưu chúng chung với nội dung phòng.
- Phân tích lại văn bản không làm mất thay đổi media cục bộ. Sau lưu thành công cập nhật thẻ mà không mở lại modal. Khi lưu lỗi có thể mở lại form với các thay đổi chưa lưu.
- Kiểm thử: `node --require tsx/cjs tools/zalo-reader/parsers/pending-media-order-ui.test.ts` và kiểm thử modal duyệt hiện có.

## CS/BC và ngày trống

- CS và BC vẫn bật `has_window` / `has_balcony`, nhưng không lặp Cửa sổ / Ban công trong `other_amenities`. Giữ nội thất, camera và mô tả chi tiết khác. Modal imports cũng lọc các dòng trùng này cho bản nháp cũ; bấm lưu để ghi lại dữ liệu đã làm sạch.
- `trống 1/12` hoặc `trống ngày 1/12` điền `Sắp trống` và ngày `YYYY-12-01`. Thiếu năm dùng năm tạo import theo múi giờ Việt Nam; không tự chuyển sang năm sau. Năm được nêu rõ trong tin luôn được giữ. `trống sẵn` vẫn là phòng trống ngay và không có ngày chờ.
- Phân tích lại dùng `pending.created_at` (fallback thời điểm tạo batch), tránh đổi năm của bản nháp cũ khi sang năm mới. Modal nhận thời điểm tạo import để hiển thị ngày cho nháp cũ còn `available_from_text`.
- Kiểm tra ngày thực: không tự sửa 31/2 hoặc 29/2 năm không nhuận. Các ngày không hợp lệ vẫn để admin xác minh.
- Test: `tools/zalo-reader/parsers/listing-fields.test.ts`, các fixture parser và kiểm thử UI modal hiện có.

## Sửa mã phòng của bản UPDATE

Admin được đổi riêng mã phòng trong imports UPDATE khi địa chỉ nhận diện vẫn khớp tòa nhà đã xác minh. Lưu nháp giữ snapshot/khóa phòng cũ và tắt tự duyệt. Không cho client đổi review, snapshot hoặc phòng đích.

Khi duyệt một UPDATE đã sửa mã, dialog giữa màn hình có hai lựa chọn: cập nhật phòng cũ (chỉ các trường đã chọn, không đổi mã phòng cũ) hoặc tạo phòng với mã mới (không cần chọn các trường UPDATE). Hủy dialog không lưu hay duyệt. Cơ chế dùng được cả ở form chỉnh sửa và chi tiết của nháp đã lưu mã mới.

API `create_room_new_code` kiểm tra quyền admin, payload/detail khớp bản vừa lưu, code thực sự khác và địa chỉ không đổi, snapshot cũ đúng matched_room_id. Resolver kiểm tra lại cả phòng chính và pending khác trước tạo. Lưu audit `_created_from_update` sau khi đăng thành công; phòng cũ và album cũ không bị thay đổi trong nhánh tạo mới. CREATE bình thường vẫn không được dùng để vượt bảo vệ UPDATE.

Không có migration. Kiểm thử hồi quy gồm lưu mã mới, chặn đổi địa chỉ, chặn payload cũ/trùng mã, tạo mới giữ phòng cũ, dialog hai lựa chọn và hủy không ghi dữ liệu.
