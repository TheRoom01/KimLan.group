# Kết quả live trial ngày 31/10/2026

Người dùng đã cho phép triển khai hai file SQL, chạy một lượt thử, sau đó cho phép thêm đúng một lượt sau bản sửa timestamp/giới hạn 24 giờ. Lượt bổ sung `816de5f7-7348-4cef-9d38-a8be9b20b941` đã kết thúc, tiến trình thoát 0, Chrome Reader đóng và khóa Reader được giải phóng. Lịch tự động chưa cài/bật.

Giờ dưới đây là Asia/Saigon:

| Nhóm | Bắt đầu | Kết thúc | Message trong cửa sổ chốt 24h | Pending TEST mới |
|---|---|---|---:|---:|
| Q1/Q3/Q10 | 09:30:01 | 09:33:35 | 236 | 3 |
| PN/BT/TB | 09:33:35 | 09:36:14 | 200 | 4 |

Hai nhóm đọc tuần tự, nhóm 2 bắt đầu sau nhóm 1 kết thúc. Mỗi nhóm chọn tối đa 5 nguồn/5 phòng trong trial, không mở rộng ngoài cửa sổ 24 giờ cố định tại lúc bắt đầu nhóm. Chế độ thật có ngân sách riêng theo config, vẫn bị chặn cứng tối đa 24 giờ.

ID nhóm PN/BT/TB đã xác minh bằng tên/header chính xác và `dom_message_id`: `g6674917926513771782`. Đã lưu config và registry.

7 nháp đã kiểm tra trực tiếp qua truy vấn database, đều `Chờ duyệt`, `is_test_import=true`, `auto_approve_enabled=false`:

| Nhóm | Mã phòng | Phân loại | Ảnh | Video | Ghi chú |
|---|---|---|---:|---:|---|
| Q1/Q3/Q10 | 103 | CREATE | 1 | 0 | |
| Q1/Q3/Q10 | 302 | CREATE | 1 | 0 | |
| Q1/Q3/Q10 | 301 | UPDATE | 2 | 0 | Có cảnh báo thiếu video |
| PN/BT/TB | Chưa có mã xác định | NEEDS_REVIEW | 4 | 0 | Không tự đoán mã phòng |
| PN/BT/TB | 301 | CREATE | 2 | 0 | |
| PN/BT/TB | G01 | UPDATE | 9 | 0 | |
| PN/BT/TB | 301 | CREATE | 12 | 0 | Khác định danh phòng/tòa so với mã 301 khác |

Tổng 31 ảnh, 0 video. Hai nguồn video-only thuộc Lầu 3 và 402 (Q1/Q3/Q10) chưa có URL video hợp lệ; một nguồn PN/BT/TB không có media hợp lệ. Cả ba bị API từ chối `NO_USABLE_MEDIA`, không tạo nháp rỗng. Không dùng thumbnail làm video. Các nguồn này vẫn chưa được checkpoint đánh dấu hoàn tất. Báo cáo runtime ghi 3 lỗi nguồn; không coi đây là một lượt hoàn toàn sạch lỗi để tự bật lịch.

11 Pending có từ trước (gồm 8 TEST) được đối chiếu đúng tập ID trước/sau: số lượng vẫn 11, fingerprint hàng nguyên vẹn `b150ee6971d5d5eded1752370157e32a`. Không ghi đè/xóa nháp cũ, không publish hoặc sửa phòng chính. Checkpoint legacy giữ SHA-256 `7A4D5A6EFF2D4FC46FF8DBCD80A881175F0CAECD13F27182B0169656EDE14891`.

Nguồn và log cục bộ lưu theo trial trong `.zalo-reader/official/trials/816de5f7-7348-4cef-9d38-a8be9b20b941/`; summary `.zalo-reader/official/runs/816de5f7-7348-4cef-9d38-a8be9b20b941.json` và JSONL cùng run ID. Không đưa URL media có token hoặc nội dung tin nhắn vào báo cáo này.

Công cụ Computer Use bị dừng vì không xác định được URL trình duyệt đủ chắc chắn; không tiếp tục thao tác giao diện. Việc ghi Pending/media được xác nhận qua database, chưa xác nhận trực quan trên UI. Người dùng xem `/admin/zalo-imports` → Chờ duyệt. Lịch mỗi giờ chỉ bật sau khi xem kết quả, xử lý/chấp nhận các cảnh báo đúng quy tắc và xác nhận cuối cùng; không kích hoạt trong lượt thử này.
