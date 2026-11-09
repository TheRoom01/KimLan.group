# Quy ước làm việc của dự án

- Thực hiện thay đổi trực tiếp trên nhánh `main`. Chỉ tạo hoặc sử dụng nhánh khác khi người dùng yêu cầu rõ ràng.
- Mọi thay đổi giao diện và mã ứng dụng phải có thể xem trên localhost:3000 từ workspace này. Người dùng tự khởi động server localhost và tự deploy website. Chỉ khởi động localhost, deploy hoặc push lên nhánh có deploy tự động khi người dùng yêu cầu rõ ràng.
- Tất cả server của dự án dùng chung Supabase project `vgmtiymubuwztqdxsexn`. Với công việc đã được người dùng giao, tự áp dụng các migration cần thiết đã kiểm thử lên DB chung để cùng kiểm thử thay đổi, rồi xác minh kết quả. Nếu có lỗi, tự chẩn đoán, khắc phục và kiểm thử lại cho đến khi đạt mục tiêu đã giao. Đồng bộ phiên bản file local với lịch sử migration trên Supabase. Không tự áp dụng các migration khác ngoài phạm vi công việc đang thực hiện.
- Nếu yêu cầu cụ thể mới hơn giới hạn việc thay đổi DB hoặc yêu cầu xác nhận trước, ưu tiên yêu cầu mới đó. Quyền tự cập nhật migration không bao gồm tự deploy mã website production.
