# Address Parser Fix V5

Bản này sửa parser phía server, không sửa Reader hoặc media matcher.

## Lỗi được sửa

Dòng:

```text
DỰ ÁN DUY TRÌ: 517/18 Nguyễn Trãi, P An Đông Q5
```

trước đây chỉ lấy được:

- Phường: An Đông
- Quận: Quận 5

nhưng bỏ:

- Số nhà: 517/18
- Đường: Nguyễn Trãi

V5 cho phép lấy địa chỉ nằm ngay sau tiêu đề:

- DỰ ÁN DUY TRÌ:
- CẬP NHẬT DỰ ÁN:
- HIFRIENDZ THÔNG BÁO DỰ ÁN:
- KHAI TRƯƠNG CHDV:
- MỞ BÁN TÒA NHÀ:

## Cài đặt

Tại thư mục gốc KimLan.group:

```powershell
node tools/zalo-reader/apply-address-parser-fix-v5.mjs
```

Sau đó test:

```powershell
npx tsx tools/zalo-reader/address-parser-smoke-test.ts
npx tsc --noEmit
```

Kết quả:

```text
Address Parser V5 regression: PASS
517/18 Nguyễn Trãi extraction: PASS
Inline HIFRIENDZ project address: PASS
```

## Backup

Script tự tạo:

```text
lib/zalo-import/parser.before-address-v5.ts
```

## Card Pending cũ

Sau khi patch, có thể bấm **Phân tích lại dữ liệu** trên card đang sai.
Vì raw text của card này đã đúng nên không cần Reader đọc lại ảnh.
