# Nâng cấp tư vấn chung

## Phạm vi

- Home chuyển tổng phòng động từ thanh phân trang lên cạnh tiêu đề. Cùng biến `total` được tái sử dụng; logic lọc, sắp xếp, tiến/lùi giữ nguyên.
- Nút Cần Tư Vấn mở chế độ general của RoomInquiryModal, không cần đăng nhập và không truyền Room ID.
- Hai chế độ modal dùng bộ token CSS riêng kem/nâu; không đổi theme Home hoặc modal quản trị khác.
- Tư vấn chung có họ tên, điện thoại Việt Nam, nhu cầu, một nguồn khách tùy chọn và kênh giới thiệu tự do.
- Chưa thêm đặt lịch tư vấn chung vì luồng hiện có chỉ hỗ trợ lịch xem một phòng. Luồng xem phòng vẫn giữ nguyên Room ID, ngày và giờ.
- API công khai vẫn xác minh Turnstile, honeypot, giới hạn dữ liệu và gọi RPC bằng service role. RPC khóa theo điện thoại, giới hạn 10 yêu cầu/giờ và chống lặp trong 2 phút.
- Tư vấn chung dùng bảng room_consult_requests hiện có, với consultation_kind=general_consultation; toàn bộ Room ID và snapshot phòng là NULL.
- Không đổi policy RLS. L1 xem được yêu cầu; nhân viên L2 chỉ xem được yêu cầu được giao như trước. Yêu cầu chung giao cho L1, hoặc một L2 dự phòng nếu chưa có L1; thông báo đi qua notifications hiện có.

## File ứng dụng

- app/HomeClient.tsx
- components/RoomList.tsx
- components/Pagination.tsx
- components/rooms/RoomInquiryModal.tsx
- components/rooms/RoomInquiryModal.module.css
- lib/consultation.ts
- app/api/room-consult-requests/route.ts
- app/api/admin/room-consult-requests/route.ts
- app/admin/room-inquiries/RoomConsultRequestsClient.tsx

## Migration và vận hành

Migration local: supabase/migrations/20261103155254_general_consultation_requests.sql.

Migration bổ sung 3 cột trên bảng hiện có, cho phép snapshot mã phòng rỗng ở tư vấn chung và thêm RPC riêng dùng cùng pipeline. Không xóa dữ liệu, không sửa RPC submit_room_consult_request_v1 và không nới quyền đọc/ghi bảng cho anon.

Đã đồng bộ migration lên DB Supabase chung ngày 03/11/2026, phiên bản 20261103155254. Schema đã được đối chiếu, quyền service_role/RLS đã được xác minh và dữ liệu hiện có được giữ nguyên. Các server dùng cùng DB, gồm localhost:3000, có thể sử dụng hàm tiếp nhận tư vấn chung mới. Chưa deploy mã website lên production. Danh sách yêu cầu cũ vẫn có fallback tương thích schema cũ.

Tiếp tục dùng cấu hình Turnstile và Supabase hiện có. Không cần tạo tài khoản khách hoặc API mới. Không thử gửi khách thật trong các bài kiểm thử.

## Kiểm thử local

- tools/consultation/general-consultation.test.ts: chạy HTTP handler thật với PostgreSQL PGlite offline, kiểm tra 5 nguồn, trường kênh tự do, validation, CAPTCHA, chống lặp, giới hạn tần suất, NULL Room ID, dữ liệu cũ, đặt lịch phòng và RLS anon/L1/L2.
- tools/consultation/consultation-ui.test.ts: kiểm tra hai chế độ modal, theme thực, validation, chọn một nguồn, chặn nhấn gửi lặp, lỗi/thành công, nguồn ở danh sách quản lý, tổng phòng động và nút phân trang; mạng/API được giả lập offline.
- TypeScript toàn dự án; build webpack; lint các file sửa so với baseline lỗi cũ.

Ảnh kiểm tra nằm trong thư mục tạm codex-consultation-ui của Windows, không ghi dữ liệu test lên Supabase.


## Kết quả đã kiểm tra

- API + PostgreSQL offline: PASS.
- Kiểm thử giao diện hai modal, nguồn khách, quản lý, mobile và phân trang: PASS.
- TypeScript toàn dự án: PASS.
- `npm run build`: PASS, hoàn tất 72 trang.
- Lint file ứng dụng chỉnh sửa: không có lỗi mới. HomeClient có 31 lỗi cũ và RoomList có 1 lỗi cũ; so sánh baseline xác nhận không tăng. Các file ứng dụng còn lại trong phạm vi này không có lỗi lint.
- Server dev đang chạy cổng 3000. Migration tư vấn chung đã được đồng bộ vào DB chung.

- Kiểm tra trực tiếp localhost:3000: mở modal general thành công, nền RGB(251,247,241), không tràn ngang trên viewport 390px. Mọi POST bị chặn trong lượt kiểm tra này.

Người dùng đã cho phép tự cập nhật các migration cần thiết trong phạm vi công việc được giao lên Supabase; các yêu cầu giới hạn cụ thể mới hơn sẽ được ưu tiên. Quy ước được ghi trong AGENTS.md.
