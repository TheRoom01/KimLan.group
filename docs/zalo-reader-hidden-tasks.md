# Reader: cửa sổ PowerShell nháy mỗi phút

Nguyên nhân phù hợp với cấu hình thực tế: `KimLan-ZaloReader-Control` gọi trực tiếp `powershell.exe` mỗi phút và khi đăng nhập Windows. `-WindowStyle Hidden` được PowerShell xử lý sau khi tiến trình console khởi tạo, nên vẫn có thể thấy cửa sổ nháy. Hai task đọc theo giờ và đọc ngay cũng dùng cách gọi đó.

Đã chuyển action của ba task sang `wscript.exe //B //Nologo hidden-task.vbs`. WScript là GUI host; nó gọi PowerShell với window style 0 ngay từ lúc tạo tiến trình, chờ tiến trình hoàn tất và chuyển tiếp exit code. Các script đọc, log, kiểm tra phiên tương tác, khóa chống chạy trùng và nhịp nhận lệnh mỗi phút vẫn được giữ.

- Cài mới và nâng cấp sử dụng chung `hidden-task-action.ps1`.
- `repair-hidden-tasks.ps1` sửa action của task đã cài, kiểm tra chủ sở hữu/workspace/wrapper và sao lưu XML vào `.zalo-reader/official/task-backups/`.
- Không thay trigger, principal, settings hoặc dừng lượt đọc đang chạy.
- Không đổi ExecutionPolicy hệ thống; vẫn dùng RemoteSigned cho tiến trình con.
- Kiểm thử launcher: mode `Probe` chỉ chạy `exit 23`, không truy cập mạng/đọc nhóm. Xác nhận exit code 23.
- Kiểm thử offline: `tools/zalo-reader/parsers/official-scheduler.test.ps1`.

Windows Script Host phải được hệ thống cho phép. Nếu bị vô hiệu hóa bởi quản trị viên, không bỏ qua chính sách; cần thay bằng launcher GUI được tổ chức cho phép.

Phân biệt: Chrome/Zalo mở khi thực sự chạy lượt đọc là hành vi của `headless: false`; bản sửa này xử lý cửa sổ console PowerShell nháy trong tác vụ nền.

## Chrome đóng giữa lượt đọc / đồng bộ

Wrapper cũ dùng `$ErrorActionPreference='Stop'` và `& node ... *> $logFile`. Windows PowerShell 5 chuyển native stderr thành `NativeCommandError`, có thể kết thúc wrapper/job ngay khi Node ghi cảnh báo hoặc lỗi nhóm, trước khi Node kịp ghi báo cáo và dọn khóa. Đây là lỗi độc lập với việc ẩn cửa sổ.

`node-process.ps1` khởi tạo Node bằng `Start-Process -WindowStyle Hidden -Wait -PassThru`, chuyển stdout và stderr trực tiếp vào hai file riêng. Wrapper lấy `ExitCode` thực tế, không dừng chỉ vì stderr có nội dung. Log lỗi nằm cạnh log thường, đuôi `.log.stderr.log`. Áp dụng cho cả lượt đọc và controller.

Kiểm thử hồi quy `parsers/node-process.test.ps1` chạy trên Windows PowerShell 5: Node ghi cảnh báo, tiếp tục ghi dấu hoàn tất, rồi trả mã 7; xác nhận cả hai luồng và exit code. Không chạy mạng hoặc tạo Pending trong kiểm thử này. Thao tác đồng bộ thực tế cần được xác nhận lại trong tài khoản đang đăng nhập.
