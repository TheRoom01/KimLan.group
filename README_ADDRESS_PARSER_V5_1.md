# Address Parser Fix V5.1

V5.1 thay thế script V5 bị lỗi do phụ thuộc format khoảng trắng.

## Trạng thái sau lỗi V5

Script V5 dừng trước khi ghi file, nên:

```text
lib/zalo-import/parser.ts
```

chưa bị sửa dở.

Backup đã tạo:

```text
lib/zalo-import/parser.before-address-v5.ts
```

có thể giữ nguyên.

## Cài đặt

Giải nén vào thư mục gốc KimLan.group, chọn ghi đè.

Chạy:

```powershell
node tools/zalo-reader/apply-address-parser-fix-v5-1.mjs
```

Test:

```powershell
npx tsx tools/zalo-reader/address-parser-smoke-test-v5-1.ts
npx tsc --noEmit
```

Kết quả:

```text
Address Parser V5.1 regression: PASS
517/18 Nguyễn Trãi extraction: PASS
Inline HIFRIENDZ project address: PASS
```
