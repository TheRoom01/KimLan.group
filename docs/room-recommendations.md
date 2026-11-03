# Đề xuất phòng phù hợp với bạn

## III.1 – Điều kiện giá (thay thế toàn bộ quy tắc cũ)

- Chỉ áp dụng giá khi khách thực sự chọn bộ lọc giá (`priceFilterActive`). Không dùng khoảng mặc định của slider.
- `recommendedMinPrice = minPrice`.
- `recommendedMaxPrice = maxPrice + 2_000_000`.
- Chỉ có MIN: giữ MIN, không tự tạo MAX. Chỉ có MAX: cộng 2 triệu vào MAX, không tự tạo MIN.
- Không lọc giá: cả hai giới hạn đề xuất là `null`, không hiển thị badge giá.
- 5–7 triệu → 5–9 triệu; 8–12 triệu → 8–14 triệu; 10–15 triệu → 10–17 triệu.
- Ví dụ giá đơn 10 triệu tương ứng [10,10] → [10,12] triệu; 7 triệu → [7,9] triệu.
- Quy tắc này thay thế cả các ví dụ cộng/trừ 2 triệu cũ trong phần logic, badge và test case.
- Các filter vị trí, trạng thái, loại phòng, tiện nghi, thú cưng, hợp đồng và badge giữ nguyên. Search/FilterBar chính không đổi giá.
- Đề xuất luôn xếp theo `coalesce(updated_at, created_at) DESC NULLS LAST, id DESC`.

## Tích hợp

Section độc lập sau RoomList, chỉ hiện khi có tiêu chí khác mặc định, không hiện trong Phòng đã lưu. IntersectionObserver tải gần cuối danh sách, tối đa 10 RoomCard, loại ID đang có trên trang chính. Dùng đúng RoomCard mặc định, không có theme kem/biến thể card. Theo yêu cầu mới, đề xuất nằm trên một hàng cuộn ngang ở desktop và mobile; có thanh cuộn native, nút trái/phải và hỗ trợ bàn phím. ResizeObserver chỉ đồng bộ độ rộng card và khoảng cách theo list chính khi đổi kích thước; không gọi API theo thao tác cuộn. Nút cuộn tôn trọng prefers-reduced-motion; không có autoplay/thư viện carousel. Không sửa lưới, tổng số, cursor hoặc dữ liệu phân trang chính. Cache client tối đa 12 bộ lọc trong 30 giây, tách theo tài khoản và cấp quyền; đổi filter/page sẽ hủy request và không giữ card cũ. Kết quả rỗng thì ẩn section; lỗi tải giữ thông báo và nút Thử lại, không giả thành không có phòng.

`NEXT_PUBLIC_ROOM_RECOMMENDATIONS_ENABLED=false` tắt section và API; cần restart dev/rebuild khi đổi biến build-time này. Mặc định bật; khi API gián đoạn, section hiển thị thông báo tải lỗi và cho phép thử lại.

POST `/api/room-recommendations` nhận bộ lọc, gọi đúng một RPC parameterized bằng server service-role client. RPC `SECURITY INVOKER`, chỉ `service_role` được EXECUTE, luôn dùng `room_full_public` và projection công khai có whitelist. Không dùng service key trong browser, không trả contact Zalo private, owner ID, policy hoặc `detail_json`.

Số nhà: RPC mặc định trả dạng che cho anon. API dùng `auth.getUser()` xác minh session cookie, đọc membership thật trong `admin_users`; chỉ L1/L2 được bổ sung đúng field `house_number` đầy đủ bằng một batch tối đa 10 ID đã được RPC chọn. Không tin `adminLevel` hay `user_metadata` từ client. RoomCard dùng nguyên logic anon/admin và nút copy của list chính. Phần sửa UI/số nhà này không cần thêm migration.

Khi không có trạng thái được chọn, chỉ lấy Đang trống/Sắp trống; nếu chọn trạng thái cụ thể, giữ nguyên. Tọa độ chỉ nhận từ điểm đã xác định, không suy đoán từ text. Home hiện chưa có resolved-location state nên không gửi tọa độ. API/RPC chuẩn bị sẵn: bán kính cố định 3 km; thiếu GPS chỉ được fallback nếu có quận phù hợp; không trả khoảng cách giả. Không mở rộng ranh giới quận.

## Migration và triển khai

Người dùng đã phê duyệt chạy migration này lên DB chung trong lượt xử lý lỗi block đề xuất biến mất. Đã áp dụng đúng RPC đề xuất, phiên bản Supabase `20261103185541`; file local đồng bộ thành `supabase/migrations/20261103185541_room_recommendations.sql` (tên chuẩn bị trước đó: `20261103180939_room_recommendations.sql`). Localhost hiện có thể gọi RPC lấy phòng thật. Không deploy mã website production.

Chỉ migration trên được áp dụng; không chạy các migration pending ngoài phạm vi. RPC `SECURITY INVOKER`, chỉ server được gọi; đã xác nhận anon/authenticated không có EXECUTE trực tiếp. Truy vấn thật Quận 1, giá 5–9 triệu trả 10 phòng. Production deploy là thao tác riêng.

Đã kiểm tra bằng browser anon thật tại localhost:3000 với Quận 1 + giá lọc 5–7 triệu: API HTTP 200, trả và render 10 phòng trong khoảng đề xuất 5–9 triệu; block vẫn giữ sau khi tải xong, không có lỗi JavaScript. UI regression cũng kiểm tra HTTP 503 giữ thông báo + nút Thử lại, sau đó phục hồi và render card; kết quả rỗng thành công vẫn ẩn section theo yêu cầu.

Rollback: đặt flag false và rebuild/restart. RPC riêng không sửa RPC Home/Maps, không sửa bảng phòng, không ảnh hưởng Reader/Imports. Có thể giữ RPC không dùng để tránh rollback phá dữ liệu.

## Kiểm thử

- Unit: `node_modules/.bin/tsx --test lib/rooms/recommendations.test.ts lib/rooms/recommendationAccess.test.ts`.
- SQL offline: `node --no-wasm-tier-up --import tsx tools/rooms/recommendations-sql.test.ts` (PGlite runtime có sẵn trong `.zalo-reader/offline-sql-runtime`, không kết nối production).
- UI: `node_modules/.bin/tsx tools/rooms/recommendations-ui.test.ts` (dữ liệu fixture chặn request, không ghi DB).
- TypeScript, eslint các file thêm/sửa và build trước bàn giao.

Kết quả: 11 unit test giá/badge/input/phân quyền qua; kiểm thử SQL trên PostgreSQL tạm qua cả tập 15.000 phòng (khoảng 302 ms cho một query mẫu local); UI Chromium tại 1440/1920 px và mobile 375/390 px so sánh kích thước, màu, font, field và lưới trực tiếp với RoomList. Đã kiểm tra số nhà đơn/số hẻm, anon/L1/L2, chuyển quyền không dùng lẫn cache, lazy loading, chống kết quả cũ, không trùng, lưu/Share/liên hệ/tư vấn, retry/flag và khoảng trống cho toolbar fixed. TypeScript và build Next.js thành công. Dữ liệu UI regression là fixture.

Đã đối chiếu anon trên localhost với phòng thật: HTTP 200, 10 phòng đề xuất; độ rộng card list chính và đề xuất cùng 318,75 px tại viewport đang kiểm tra, cùng màu nền. API không trả số nhà đầy đủ khi anon tự gửi `adminLevel` giả. Quyền L1/L2 được kiểm tra bằng unit test của server và UI fixture, không tạo tài khoản hoặc session admin thử nghiệm trên DB.

Đã chạy thêm SELECT EXPLAIN ANALYZE của thân query trên DB hiện tại, không tạo RPC: Quận 1 + giá đề xuất 5–9 triệu + điểm GPS + 3 km mất khoảng 450 ms thực thi (135 ms lập kế hoạch), chưa gồm mạng. Đây là một phép đo, chưa phải load test hay cam kết p95.

Lint file chức năng mới qua. Hai component HomeClient/RoomCard mỗi file đang có 31 lỗi lint cũ, chủ yếu `no-explicit-any`; đối chiếu source trước/sau phần đề xuất xác nhận số lỗi và số lượng từng rule không tăng. Không sửa các đoạn ngoài phạm vi chỉ để làm sạch lint.

## File trong phạm vi thay đổi

- `app/HomeClient.tsx`: chỉ nối section sau RoomList, không sửa query/pagination chính.
- `components/RoomCard.tsx`: dùng duy nhất giao diện mặc định, giữ hành động và phân quyền hiện tại.
- `components/RoomList.tsx`, `lib/rooms/grid.ts`, `app/globals.css`: giữ giao diện lưới list chính, là nguồn độ rộng card.
- `components/rooms/RoomRecommendations.tsx`, `RoomRecommendations.module.css`: lazy loading, cache tách quyền, card đồng bộ list chính và một hàng cuộn ngang desktop/mobile.
- `lib/rooms/recommendationAccess.ts`, `recommendationAccess.test.ts`: xác minh quyền server trước khi bổ sung số nhà.
- `lib/rooms/recommendations.ts`: quy tắc giá mới, badge và ánh xạ/kiểm tra filter.
- `app/api/room-recommendations/route.ts`: API riêng.
- `supabase/migrations/20261103185541_room_recommendations.sql`: RPC mới, đã áp dụng sau khi người dùng phê duyệt.
- `lib/rooms/recommendations.test.ts`, `tools/rooms/recommendations-sql.test.ts`, `tools/rooms/recommendations-ui.test.ts`, `tools/rooms/fixtures/recommendation-schema.json`: kiểm thử và metadata fixture.
- `docs/room-recommendations.md`: yêu cầu giá thay thế, tích hợp và hướng dẫn triển khai.
