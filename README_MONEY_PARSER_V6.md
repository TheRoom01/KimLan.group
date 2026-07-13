# Money Parser Fix V6

## Lỗi được sửa

Trước đây:

```text
Điện 3k8/số
```

bị regex cắt thành:

```text
3k
```

và parser trả về:

```text
3.000đ
```

Sau V6:

```text
3k8   = 3.800đ
3k80  = 3.800đ
3k800 = 3.800đ
3k05  = 3.050đ
```

Logic được dùng chung cho:

- Điện
- Nước
- Phí dịch vụ
- Giữ xe
- Các khoản phí khác

## Cài đặt

Giải nén ZIP vào thư mục gốc KimLan.group và chọn ghi đè.

Chạy:

```powershell
node tools/zalo-reader/apply-money-parser-fix-v6.mjs
```

Test:

```powershell
npx tsx tools/zalo-reader/money-parser-smoke-test-v6.ts
npx tsc --noEmit
```

Kết quả:

```text
Money Parser V6 regression: PASS
Điện 3k8 -> 3.800đ: PASS
139 Tô Hiến Thành sample: PASS
```

## Backup

Script tự tạo:

```text
lib/zalo-import/parser.before-money-v6.ts
```

## Deploy

Sau khi test thành công, commit và push `lib/zalo-import/parser.ts`
để website/Vercel sử dụng parser mới.
