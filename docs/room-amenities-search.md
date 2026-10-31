# Ban công, Cửa sổ và tìm kiếm Home

- Hai boolean `room_details.has_balcony` / `has_window` được thêm cạnh tiện ích hiện có trong Admin/Imports và form chủ nhà. Hiển thị trên thẻ phòng, chi tiết, trang chủ nhà và chia sẻ.
- Filterbar → Tiện Nghi → Không gian phòng: chọn Ban công, Cửa sổ hoặc cả hai. Chọn cả hai nghĩa là phòng phải có cả hai. Clear/Đặt lại xóa lựa chọn; URL, SSR, phân trang, quay lại và danh sách đã lưu đều giữ đúng bộ lọc.
- Search Home tìm đường, phường, quận, mô tả và tiện nghi khác, không phân biệt hoa/thường. Nhận riêng `P.13`, `Phường 13`, `Q1`, `Quận 1` để không nhầm số quận/phường thành số nhà.
- Anon dùng document địa chỉ công khai không có số nhà; số nhà đã biết cũng bị loại khỏi document mô tả/tiện nghi dùng để tìm kiếm. Admin L1/L2 vẫn tìm số nhà. RPC tự xác minh role từ `auth.uid()`, giữ các điều kiện phiên anon/VIP, ownership field riêng tư, visibility và phân trang hiện có.
- Phòng cũ mặc định hai tiện ích mới là tắt, không suy đoán hoặc cập nhật hàng loạt từ văn bản cũ. Admin có thể bật từng tiện ích khi sửa phòng. Tin Zalo mới có marker BC/CS giữ nguyên thông tin gốc và điền boolean tương ứng.

Migration `20261031051125_room_balcony_window_public_search.sql` đã áp dụng lên Supabase ngày 31/10/2026. Nó thêm cột/index, mở rộng hàm lưu tiện ích và sửa ba nhánh search của RPC Home; không đổi hàm tìm kiếm bảng Admin hoặc các quy tắc quyền. Kiểm tra catalog và helper trên production thành công; không tạo phòng thử trên production.

`npm run test:room-features` chạy test pure/VM, PostgreSQL offline và UI headless (mạng bị chặn). SQL test dùng PGlite tool runtime tại `.zalo-reader/offline-sql-runtime`, hoặc đặt `OFFLINE_SQL_RUNTIME` trỏ đến bản PGlite có contrib pg_trgm. Không thêm dependency vào ứng dụng. Regression parser/Imports, TypeScript và `git diff --check` cũng đã PASS.
