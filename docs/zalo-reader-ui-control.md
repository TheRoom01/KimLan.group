# Start/Stop và Mở Zalo từ Imports

Start bật lịch và yêu cầu chạy ngay một lượt bằng production runner, tương đương `npm run zalo-reader:production`. Các lượt tự động tiếp theo vẫn cách lượt hoàn tất 60 phút. Nếu đã có Reader đang chạy, khóa hiện có không cho mở thêm lượt trùng. Stop vô hiệu hóa các lượt sau; không cưỡng bức dừng Chrome hay lượt đang xử lý.

Web chỉ gửi yêu cầu. Một task nhỏ trên máy Windows tự hoạt động khi đăng nhập và nhận lệnh mỗi phút, dùng chính `scheduler.ps1 Enable/Disable`. Start còn mở wrapper chạy ngay ở nền; production runner kết nối cửa sổ Zalo dùng chung do task riêng quản lý. Không cần VS Code hoặc cửa sổ PowerShell. UI xác nhận máy đã nhận lệnh và lịch đã bật/tắt; trạng thái từng nhóm bên dưới cho biết lượt đọc thực tế. Task nhận lệnh không quét tin nhắn, không publish, không đánh thức máy; lệnh Mở Zalo chỉ hiển thị cửa sổ dùng chung. Máy nghỉ/offline thì UI hiển thị chờ xác nhận; không được xem lệnh chờ là đã dừng.

## Thiết lập một lần

1. Áp dụng `supabase/sql/zalo-reader-control.sql` vào cùng database của website. Bảng bật RLS, chỉ service role đọc/ghi; mọi thao tác trên UI cần tài khoản admin cấp 1/2. Không đưa internal secret vào frontend.
2. Deploy code website có hai API `/api/admin/zalo-reader/control` và `/api/internal/zalo-reader/control`.
3. Cập nhật code trên máy Reader. Dùng đúng tài khoản Windows đang sở hữu `KimLan-ZaloReader-60m`, đã có Node/tsx và `.env.local` chứa `ZALO_READER_INTERNAL_SECRET` trùng website. Địa chỉ lấy từ `production.config.json`.
4. Trong PowerShell tại thư mục dự án:

```powershell
.\tools\zalo-reader\control-agent-install.ps1 -Action Install
```

Sau khi thiết lập xong: mở máy, đăng nhập Windows bằng tài khoản đã cài Reader, mở website Imports, bấm Start. Không cần chạy `npm` thủ công. Máy cần có mạng, phiên Zalo còn đăng nhập và code dự án còn ở đúng thư mục đã cài. Website production phải được deploy; chạy dev local vẫn cần server dev hoạt động.

Cài task chỉ bật bộ nhận lệnh; không tự thay đổi trạng thái lịch Reader khi chưa có lệnh từ UI. Start vẫn kiểm tra nhóm đã xác minh. Lịch mới cần báo cáo hoàn tất như trước; lịch đã bật sẵn khi cài bộ điều khiển được ghi nhận quyền resume để Stop/Start không yêu cầu chạy thử lại. Quyền resume hết hiệu lực khi đổi tài khoản Windows, API đích, profile hoặc nhóm. Nếu máy chưa đạt điều kiện, UI báo không áp dụng được lệnh.

Kiểm tra bộ nhận lệnh:

```powershell
.\tools\zalo-reader\control-agent-install.ps1 -Action Status
```

Gỡ bộ nhận lệnh (không thay đổi lịch đọc):

```powershell
.\tools\zalo-reader\control-agent-install.ps1 -Action Remove
```

Nếu website/API không truy cập được, dùng lệnh dự phòng trên máy Reader:

```powershell
.\tools\zalo-reader\scheduler.ps1 -Action Disable
```

Lệnh mới thay thế lệnh cũ đang chờ. Xác nhận một lệnh cũ không thể xác nhận nhầm lệnh mới. Chỉ có một máy Reader chính dùng internal secret này; không cài bộ nhận lệnh trên nhiều máy.

Mỗi yêu cầu Start có biên nhận riêng trên máy tại `.zalo-reader/official/ui-start-requests` để lỗi gửi xác nhận không khởi động lại cùng một lệnh. Biên nhận xác nhận đã yêu cầu tạo tiến trình, không thay thế báo cáo thành công/thất bại của lượt đọc. Log của lượt chạy nằm trong `.zalo-reader/official/console`.

Nâng cấp bộ điều khiển đã cài: `control-agent-install.ps1 -Action Upgrade`. Lượt chạy ngay dùng task độc lập `KimLan-ZaloReader-Now`, không có trigger tự chạy và không chịu timeout 5 phút của bộ nhận lệnh. Task này chỉ được gọi khi xử lý Start; trạng thái khóa của production runner ngăn chạy trùng.


## Mở đúng phiên Zalo và dùng lại cửa sổ

Nút **Mở Zalo** cạnh Start/Stop mở hoặc đưa ra trước cửa sổ trên **máy Windows chạy Reader**, không phải trên máy đang xem website từ xa. Admin có thể quét QR và đồng bộ tin nhắn trong cửa sổ này. Mở Zalo không bật lịch, không tạo pending và không yêu cầu chạy quét.

Task `KimLan-ZaloReader-Browser` chạy bằng cùng tài khoản Windows, chỉ khi được yêu cầu, không có trigger và không giới hạn thời gian. Task này sở hữu profile `.zalo-reader/profile`; kết nối điều khiển chỉ lắng nghe loopback với cổng ngẫu nhiên. Reader kiểm tra profile thực từ command line Chromium trước khi kết nối. Không dùng tài khoản/profile Zalo cá nhân khác.

Khi cửa sổ đã mở, Start và các lượt đọc theo lịch kết nối lại vào chính tab Zalo đó, không reload tab đã đăng nhập. Kết thúc lượt đọc chỉ ngắt kết nối Reader, giữ cửa sổ và phiên đăng nhập cho admin. Đóng toàn bộ cửa sổ sẽ kết thúc task cửa sổ; lần Mở Zalo hoặc lượt đọc tiếp theo sẽ mở lại đúng profile. Stop vẫn chỉ tắt lịch, giữ cửa sổ đang mở.

Nâng cấp đồng bộ theo thứ tự:

1. Chạy lại `supabase/sql/zalo-reader-control.sql` để bổ sung các cột lệnh mở độc lập. Script chạy lại được; không bật lịch Reader.
2. Cập nhật code trên máy Reader rồi chạy `control-agent-install.ps1 -Action Upgrade` bằng tài khoản Windows sở hữu Reader. Thao tác này thêm task cửa sổ, không tự mở Zalo hoặc bắt đầu quét.
3. Deploy website và kiểm tra nút Mở Zalo. Nếu còn lượt Reader dùng code cũ đang chạy, chờ lượt đó kết thúc và đóng cửa sổ Zalo cũ một lần trước khi dùng cửa sổ chung. Không xóa lock profile hoặc cưỡng bức dừng lượt đọc.

UI chỉ báo đã xác nhận mở sau khi máy Reader đã kết nối đúng profile và đưa tab Zalo ra trước. Máy offline giữ lệnh chờ; mở thất bại cho phép thử lại. Lệnh Mở Zalo và Start/Stop có request/ACK riêng, không thay thế nhau. Log cửa sổ nằm trong `.zalo-reader/official/console/browser-*.log`.
