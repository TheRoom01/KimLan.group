# Money Parser Fix V6.1

V6.1 thay thế V6 bị lỗi do V6 dùng chuỗi khớp tuyệt đối và không tương thích CRLF trên Windows.

## Trạng thái sau lỗi V6

V6 dừng trước khi ghi file, nên `lib/zalo-import/parser.ts` chưa bị sửa dở.

## Cài đặt

Giải nén ZIP vào thư mục gốc `KimLan.group`, chọn ghi đè.

Chạy:

```powershell
node tools/zalo-reader/apply-money-parser-fix-v6-1.mjs
```

Test:

```powershell
npx tsx tools/zalo-reader/money-parser-smoke-test-v6-1.ts
npx tsc --noEmit
```

Kết quả:

```text
Money Parser V6.1 regression: PASS
Điện 3k8 -> 3.800đ: PASS
139 Tô Hiến Thành sample: PASS
```
