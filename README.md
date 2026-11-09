# Auto read patch v2

Bản này dùng regex thay vì tìm một đoạn code cố định, nên hoạt động ngay cả khi `index.tsx` có khác biệt về khoảng trắng hoặc xuống dòng.

Giải nén đè vào thư mục dự án rồi chạy:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\apply-auto-read.ps1 -ProjectRoot "C:\Users\Admin\Desktop\KimLan.group"
```

Sau đó:

```powershell
npm run build
```

## Biến môi trường server

Anonymous Home dùng chữ ký HMAC do server cấp. Production nên cấu hình một giá trị ngẫu nhiên tối thiểu 32 ký tự cho `ANON_HOME_SESSION_SECRET`. Biến này chỉ thuộc môi trường server, không được thêm tiền tố `NEXT_PUBLIC_` hoặc gửi xuống trình duyệt.
