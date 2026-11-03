# Quy ước làm việc của dự án

- Người dùng yêu cầu mọi thay đổi giao diện và mã ứng dụng có thể xem trên localhost:3000 từ workspace này.
- Tất cả server của dự án dùng chung Supabase project `vgmtiymubuwztqdxsexn`. Với công việc đã được người dùng giao, tự áp dụng các migration cần thiết đã kiểm thử lên DB chung và xác minh kết quả, không hỏi lại chỉ vì đây là migration. Đồng bộ phiên bản file local với lịch sử migration trên Supabase. Không tự áp dụng các migration khác ngoài phạm vi công việc đang thực hiện.
- Nếu yêu cầu cụ thể mới hơn giới hạn việc thay đổi DB hoặc yêu cầu xác nhận trước, ưu tiên yêu cầu mới đó. Quyền tự cập nhật migration không bao gồm tự deploy mã website production.
