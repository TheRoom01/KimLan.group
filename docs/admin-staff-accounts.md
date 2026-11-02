# Tạo / cấp tài khoản NV

Đã kiểm tra dự án Supabase `vgmtiymubuwztqdxsexn` (TheRoom.canhodichvu).
Supabase Auth quản lý đăng nhập; `public.admin_users` lưu quyền và hồ sơ.
`get_my_admin_level()` và các trang/RPC hiện có chỉ hỗ trợ L1, L2.
Chức năng dùng lại bảng này, không tạo một nguồn phân quyền thứ hai.

- Nút **Tài khoản NV** nằm cạnh **Quản lý phòng**, chỉ hiện với L1. Mở danh sách NV và có nút **Tạo tài khoản NV** ở đầu bảng để mở lại form tạo/cấp quyền.
- Tạo tài khoản mới: email, mật khẩu, họ tên, SĐT, L1/L2. Email được xác nhận bởi quản trị viên; không gửi email tự động.
- Cấp cho tài khoản có sẵn: nhập email đăng nhập hiện có; không đổi mật khẩu.
- Form tạo từ chối cấp lại tài khoản đã có quyền Admin. Dùng **Thay đổi quyền** ở cuối dòng để đổi L1/L2.
- Danh sách chỉ hiển thị tài khoản có quyền L1/L2 và Auth còn tồn tại, chưa xóa mềm hoặc đang bị cấm đăng nhập. Đây là trạng thái được cấp quyền, không phải chỉ báo online.
- **Xóa Tài khoản** mở xác nhận và thu hồi quyền Admin bằng cách xóa hồ sơ `admin_users`. Giữ Auth và dữ liệu phòng, không xóa người dùng đăng nhập hay dữ liệu liên quan.
- Cấm tự xóa/tự đổi quyền tài khoản đang thao tác; chặn xóa/hạ quyền L1 cuối. RPC khóa bảng khi cập nhật để kiểm tra quyền và ghi trong cùng transaction. Yêu cầu có cấp quyền cũ để phát hiện danh sách đã lỗi thời.
- Đổi/xóa quyền được ghi trong bảng nội bộ `admin_staff_private.account_events` (người thao tác, tài khoản đích, quyền trước/sau, thời điểm). Client không được đọc/ghi trực tiếp bảng này.
- Ngày cấp lấy từ `now()` trong database; giao diện hiển thị giờ Việt Nam.
- `created_by` lưu UUID người cấp. Không chỉnh ngày tạo của tài khoản Admin cũ.
- API kiểm tra phiên, L1 và origin; RPC kiểm tra L1 lần nữa trước khi ghi.
- Bảng đã bật RLS; khách không được đọc, người đăng nhập không được ghi trực tiếp. Admin L1/L2 vẫn đọc hồ sơ Admin theo nhu cầu hiện có.

Migration đã áp dụng lên Supabase. Giao diện/API cần triển khai bản ứng dụng mới để xuất hiện trên website đang chạy.

Kiểm tra: TypeScript, lint các file ứng dụng thay đổi, production build; SQL kiểm thử L1/L2/không phiên, trùng tài khoản, cấp không hỗ trợ, thời điểm và người cấp. SQL chạy trong transaction và rollback toàn bộ.
Kiểm thử UI: `npx tsx tools/admin/staff-ui.test.ts` (API giả lập, không tạo nhân viên thật).
Kiểm thử quản lý: `npx tsx tools/admin/staff-management-ui.test.ts`; SQL `supabase/tests/manage_staff_accounts.sql` chạy rollback toàn bộ, xác nhận danh sách, quyền L1/L2, đổi quyền, thu hồi quyền, giữ Auth, audit, chống tự sửa, chống thao tác trên quyền cũ và L1 cuối.

Advisors còn phát hiện vấn đề có sẵn ngoài phạm vi thay đổi: view `public.device_sessions_with_user` có thể để vai trò `anon` đọc dữ liệu `auth.users`. Chưa sửa view này trong chức năng cấp NV.
Hướng dẫn: https://supabase.com/docs/guides/database/database-linter?lint=0002_auth_users_exposed
