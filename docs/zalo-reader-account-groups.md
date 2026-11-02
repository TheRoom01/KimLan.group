# Nhóm Zalo sau khi đổi tài khoản

Đã xác minh trực tiếp hai nhóm trong phiên `.zalo-reader/profile` ngày 03/11/2026 (giờ Việt Nam), bằng kết quả tìm kiếm tên chính xác duy nhất và đối chiếu ID tin nhắn DOM với IndexedDB:

| Nhóm | Mã nguồn ổn định trên server | Group ID của tài khoản hiện tại | Số ID DOM khớp |
| --- | --- | --- | --- |
| Q1,Q3,Q10 | g1986619726266954037 | g6040898958385854853 | 20 |
| PN,BT,TB | g6674917926513771782 | g1506001042738564534 | 48 |

Nguyên nhân `DOM_WINDOW_GROUP_UNVERIFIED`: Reader dùng ID cuộc trò chuyện của tài khoản cũ để đọc IndexedDB tài khoản mới. Đồng bộ có dữ liệu nhưng ID cũ không có bản ghi tương ứng.

`production.config.json` nay có `accountGroupId` cho mỗi nhóm. `official-runner.ts` đưa ánh xạ vào cấu hình đọc. Reader dùng ID hiện tại khi truy vấn dữ liệu cục bộ; chỉ chuyển sang mã nguồn ổn định trước khi xác minh phiên/import khi có ID tin nhắn DOM khớp dữ liệu nhóm hiện tại và đúng một kết quả tên nhóm. Sai nhóm, trùng tên hoặc thiếu bằng chứng sẽ bị chặn. Không thay Group ID server, lịch sử Pending hoặc checkpoint cũ.

Kiểm thử: `account-group-identity.test.ts`, `timestamp-window.test.ts`, `production-mode.test.ts`; TypeScript toàn dự án. Công cụ `verify-current-groups.ts` mở nhóm và đối chiếu ID, không gọi API import hoặc tạo Pending. `diagnose-group-scope.mjs` chỉ đọc metadata IndexedDB qua trang giả lập ngoại tuyến.

Sau khi người dùng xác nhận, đã chạy đúng một lượt production `1c97b4f3-ee79-46db-8145-97f71800196e`, hoàn tất khoảng 00:35 ngày 03/11/2026. Cả hai nhóm có trạng thái `idle`, `failed=0`, `error_code=null` trên Supabase. Tạo 0 Pending.

Đối chiếu metadata ngoại tuyến sau lượt chạy: IndexedDB nhóm Q1/Q3/Q10 có tin mới nhất lúc 17:25:40 ngày 01/11/2026; PN/BT/TB lúc 17:23:32 cùng ngày (giờ Việt Nam). Cả hai index có 0 bản ghi trong cửa sổ 24 giờ hiện hành. Đây là tình trạng dữ liệu cục bộ; không kết luận nhóm trên máy chủ Zalo không có tin mới hơn. Không mở rộng cửa sổ hoặc chạy thêm lượt gửi dữ liệu trong lần xác nhận này.
