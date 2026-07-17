KIMLAN.GROUP - PATCH CUỐI KIẾN TRÚC BLOCK TÒA NHÀ / PHÒNG

Sửa đồng thời:
- Ngày đăng phòng không bị nhận thành địa chỉ.
- Text-only block không tạo phòng giả.
- Media thiếu marker vẫn tạo Pending Review.
- Marker nhiều mã tách thành nhiều phòng.
- Một album dùng chung cho nhiều marker cùng message.
- Separator vẫn là ranh giới block tuyệt đối.
- Sửa lỗi cast Giai đoạn 3 nếu file local còn xuống dòng sai.

Cách chạy:
1. Giải nén, copy vào C:\Users\Admin\Desktop\KimLan.group
2. Replace files.
3. Chạy AP_DUNG_PATCH_CUOI_BLOCK_PHONG.bat

Hoặc chạy thủ công:
node tools/zalo-reader/apply-final-building-room-architecture.mjs
npm run test:zalo-parser
npm run test:zalo-lookback
npm run build:webpack

Backup:
.zalo-reader\final-building-room-backups\<thời-gian>\

Dòng test mới:
Final building-room architecture regression: PASS
