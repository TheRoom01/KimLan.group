# KimLan Zalo Reader – Semantic Timeline Parser

Bộ file này thay tầng ghép dữ liệu phòng của Reader bằng luồng:

1. Nhận diện dữ liệu tòa nhà và địa chỉ.
2. Chia timeline thành từng tòa nhà.
3. Tìm toàn bộ marker phòng trong từng tòa nhà.
4. Gom ảnh theo `groupLayoutId` thành album nguyên khối.
5. Tự nhận diện thứ tự `marker → ảnh` hoặc `ảnh → marker`.
6. Mỗi album chỉ được gắn cho tối đa một phòng.
7. Không cho ảnh vượt qua ranh giới tòa nhà.
8. Vẫn tạo Pending Import nếu thiếu marker, chỉ có ảnh/video hoặc chỉ có text.

## Các file mới

Sao chép nguyên thư mục sau vào project:

```text
tools/zalo-reader/parsers/
```

Các file gồm:

```text
types.ts
utils.ts
message-classifier.ts
building-segmenter.ts
media-matcher.ts
semantic-timeline.ts
index.ts
semantic-parser-smoke-test.ts
```

Sao chép thêm:

```text
tools/zalo-reader/apply-semantic-parser-patch.mjs
tools/zalo-reader/restore-reader-backup.mjs
```

## File dán đè

Dán đè file:

```text
tools/zalo-reader/config.json
```

Mỗi nhóm đang dùng:

```json
"parser": "semantic-timeline"
```

Muốn tạm quay riêng một nhóm về logic cũ, đổi thành:

```json
"parser": "legacy"
```

## Patch file Reader chính

Tại thư mục gốc project chạy:

```powershell
node tools/zalo-reader/apply-semantic-parser-patch.mjs
```

Script sẽ:

- tạo backup `tools/zalo-reader/zalo-reader.before-semantic-parser.ts`;
- thêm import semantic parser;
- thay đúng lệnh tạo `RoomPreview`;
- giữ nguyên logic Group ID, cuộn Zalo, hydrate IndexedDB, JXL, video và API import.

Không chạy script khi bạn chưa sao chép thư mục `parsers` vào đúng vị trí.

## Kiểm tra parser không cần mở Zalo

```powershell
npx tsx tools/zalo-reader/parsers/semantic-parser-smoke-test.ts
```

Kết quả đúng:

```text
Semantic parser smoke test: PASS
```

Smoke test bao gồm đủ ba dạng:

- marker phòng trước, hình ảnh sau;
- hình ảnh trước, marker phòng sau;
- dữ liệu tòa nhà và marker phòng trong cùng message.

## Kiểm tra TypeScript

```powershell
npx tsc --noEmit
```

## Chạy Reader

```powershell
npx tsx tools/zalo-reader/zalo-reader.ts
```

Sau khi chạy, kiểm tra file:

```text
.zalo-reader/network/<session>/active-group-room-preview.json
```

Mỗi phòng có thể xuất hiện các warning:

```text
SEMANTIC_MEDIA_BIAS:before
SEMANTIC_MEDIA_BIAS:after
MEDIA_ASSIGNMENT_UNCERTAIN
MEDIA_ASSIGNMENT_LOW_CONFIDENCE
NO_ROOM_MARKER
NO_HOUSE_INFO
NO_IMAGES
NO_MEDIA
INCOMPLETE_ALBUM
VIDEO_SOURCE_URL_MISSING
```

`SEMANTIC_MEDIA_BIAS:before` nghĩa là parser nhận diện nhóm đang gửi ảnh trước marker.

`SEMANTIC_MEDIA_BIAS:after` nghĩa là parser nhận diện nhóm đang gửi marker trước ảnh.

## Khôi phục Reader cũ

```powershell
node tools/zalo-reader/restore-reader-backup.mjs
```

## Dữ liệu cần gửi lại sau lần chạy đầu

Để tinh chỉnh theo dữ liệu Zalo thật, gửi lại hai file của cùng một lượt chạy:

```text
active-group-messages.json
active-group-room-preview.json
```

Nếu tên file export thực tế khác, gửi file JSON chứa danh sách message có các trường `msgId`, `sendDttm`, `fromUid`, `text`, `groupLayoutId`, `imageIndex`, `totalImages`, `imageUrls` và `videoUrls`.
