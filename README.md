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
