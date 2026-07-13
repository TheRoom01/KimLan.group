# Semantic Parser Fix V3

Sửa lỗi không mở tòa nhà mới với các dạng:

- `HIFRIENDZ THÔNG BÁO DỰ ÁN DUY TRÌ QUẬN 3:`
- `413/8 Lê Văn Sỹ_F12_ Quận 3`
- Form cũ trong lịch sử chỉ còn dữ liệu tòa nhà, chưa có marker/media.
- Dòng trạng thái `1/8 trống` bị nhận nhầm thành địa chỉ.

## File được thay đổi

- `tools/zalo-reader/parsers/utils.ts`
- `tools/zalo-reader/parsers/building-segmenter.ts`
- `tools/zalo-reader/parsers/semantic-parser-smoke-test.ts`

## Cài đặt

1. Giải nén ZIP vào thư mục gốc `KimLan.group`.
2. Chọn ghi đè các file trong `tools/zalo-reader/parsers`.
3. Không chạy lại `apply-semantic-parser-patch.mjs`.
4. Chạy:

```powershell
npx tsx tools/zalo-reader/parsers/semantic-parser-smoke-test.ts
npx tsc --noEmit
npx tsx tools/zalo-reader/zalo-reader.ts
```

Kết quả test cần có:

```text
Semantic parser smoke test: PASS
Emoji address building-boundary regression: PASS
HIFRIENDZ underscore-address regression: PASS
```
