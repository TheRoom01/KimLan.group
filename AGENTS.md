# Quy ước làm việc của dự án

- Mọi thay đổi giao diện và mã ứng dụng phải có thể xem trên localhost:3000 từ workspace này. Người dùng tự khởi động server. Chỉ chạy server localhost:3000 khi người dùng yêu cầu rõ ràng.
- Tất cả server của dự án dùng chung Supabase project `vgmtiymubuwztqdxsexn`. Với công việc đã được người dùng giao, tự áp dụng các migration cần thiết đã kiểm thử lên DB chung để cùng kiểm thử thay đổi, rồi xác minh kết quả. Nếu có lỗi, tự chẩn đoán, khắc phục và kiểm thử lại cho đến khi đạt mục tiêu đã giao. Đồng bộ phiên bản file local với lịch sử migration trên Supabase. Không tự áp dụng các migration khác ngoài phạm vi công việc đang thực hiện.
- Nếu yêu cầu cụ thể mới hơn giới hạn việc thay đổi DB hoặc yêu cầu xác nhận trước, ưu tiên yêu cầu mới đó. Quyền tự cập nhật migration không bao gồm tự deploy mã website production.
