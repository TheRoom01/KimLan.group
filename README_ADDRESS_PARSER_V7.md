# Address Parser Fix V7

## Lỗi được sửa

Parser cũ chỉ cho phép số nhà bắt đầu bằng chữ số:

```text
517/18
90/88F
1186
```

Nên địa chỉ sau bị bỏ:

```text
B19/6 Cư Xá Phú Lâm B. Q6
```

V7 hỗ trợ thêm:

```text
B19/6
A12/3
C5
12A/7B
```

## Cài đặt

Giải nén ZIP vào thư mục gốc `KimLan.group` và chọn ghi đè.

Chạy:

```powershell
node tools/zalo-reader/apply-address-parser-fix-v7.mjs
```

Test:

```powershell
npx tsx tools/zalo-reader/address-parser-smoke-test-v7.ts
npx tsc --noEmit
```

Kết quả:

```text
Address Parser V7 regression: PASS
B19/6 Cư Xá Phú Lâm B. extraction: PASS
Numeric house-number regression: PASS
```

## Sau khi deploy

Card Pending cũ đã giữ đúng raw text và ảnh. Sau khi push/deploy,
chỉ cần bấm `Phân tích lại dữ liệu`.

Kết quả:

```text
Số nhà: B19/6
Đường: Cư Xá Phú Lâm B.
Quận: Quận 6
```
