# Fix V4 — tách nhiều marker trong cùng một tòa nhà

Bản V4 là bản **cộng dồn**: đã chứa các sửa đổi của V2, V3 và V4.
Có thể giải nén ghi đè trực tiếp lên thư mục gốc project.

## Lỗi đã sửa

Các marker sau giờ được nhận diện là phòng độc lập:

- `Trống mã 902 giá 4tr8`
- `Trống mã 503 + 803 giá 6tr`
- `Trống phòng P202 - 4,9tr`
- `Còn trống 301 giá 5tr`

Với timeline ảnh trước marker:

- Album trước `902` chỉ thuộc record `902`.
- Album trước `503 + 803` chỉ thuộc record đại diện `503`.
- Một album không bị nhân đôi hoặc dồn chung vào record cuối.

`503 + 803` được giữ nguyên trong marker text; mã đại diện là `503` vì đây là một marker dùng chung một giá và một bộ ảnh.
