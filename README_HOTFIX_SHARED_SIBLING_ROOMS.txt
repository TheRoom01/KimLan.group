HOTFIX SHARED SIBLING ROOMS

Lỗi:
Marker "Trống mã 503 + 803 giá 6tr" được tách thành 503 và 803,
nhưng scoring chỉ gắn album vào một room.

Sửa:
Các room có cùng marker messageId được xem là sibling.
Nếu sibling group xác định đúng 1 album, album đó được gắn cho tất cả
room trong nhóm.

An toàn:
Nếu sibling group có nhiều album khác nhau, patch không tự chia sẻ.

Chạy:

node tools/zalo-reader/apply-hotfix-shared-sibling-rooms.mjs
npm run test:zalo-parser
npm run test:zalo-lookback
npm run build:webpack
