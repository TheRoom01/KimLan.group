# Zalo Reader architecture

## Mục tiêu

Giữ luồng Reader Zalo dễ tìm, dễ debug và ít rủi ro thay đổi hành vi.

## Kiến trúc đang áp dụng

```text
Zalo Reader client
    ↓
app/api/internal/zalo-reader/import/route.ts
    ↓
lib/zalo-reader/import-service.ts
    ├── lib/zalo-import/parser.ts
    ├── lib/zalo-import/resolve.ts
    ├── lib/zalo-import/quality.ts
    ├── lib/zalo-import/publish-pending-room.ts
    └── lib/r2/zalo-temp.ts
```

## Điểm vào duy nhất

### HTTP route

`app/api/internal/zalo-reader/import/route.ts`

Route chỉ khai báo Node.js runtime và chuyển tiếp `POST` sang import service. Không đặt parser, Supabase, R2 hoặc publish logic trong route.

### Import service

`lib/zalo-reader/import-service.ts`

Đây là file trung tâm để debug toàn bộ luồng:

```text
auth
→ parse request
→ duplicate lookup
→ parse room
→ resolve existing room
→ create batch
→ upload media
→ update diagnostics
→ evaluate quality
→ optional publish
→ response
```

Khi lỗi xảy ra, bắt đầu tìm tại `import-service.ts`, sau đó đi vào đúng module chuyên trách được import ở đầu file.

## Module hỗ trợ

### `lib/zalo-reader/request.ts`

Chứa các helper thuần liên quan đến request và dữ liệu đầu vào:

- internal secret validation
- source hash
- PostgREST-safe string và JSON
- error formatting
- number normalization
- reader issue normalization

### `lib/zalo-reader/media.ts`

Chứa các helper media thuần:

- Base64 decoding
- video và thumbnail temporary key
- Zalo remote URL allowlist
- download timeout và size limit
- MIME normalization
- image/video extension detection

### `lib/zalo-reader/types.ts`

Chứa contract dùng chung cho image, video, issue, request và import stage.

## Quy tắc debug

1. Request không vào được: mở `route.ts`, secret và request logs.
2. Nội dung phòng sai: mở `lib/zalo-import/parser.ts`.
3. Kế thừa hoặc tìm phòng trùng sai: mở `lib/zalo-import/resolve.ts`.
4. Ảnh/video lỗi: mở phần media trong `import-service.ts`, sau đó `lib/zalo-reader/media.ts` hoặc `lib/r2/zalo-temp.ts`.
5. Điểm chất lượng hoặc auto-import sai: mở `lib/zalo-import/quality.ts`.
6. Approve/publish sai: mở `lib/zalo-import/publish-pending-room.ts`.

## Nguyên tắc an toàn

Refactor kiến trúc này không thay đổi:

- API request hoặc response shape
- database schema
- parser output
- R2 object path
- media limits
- quality scoring
- auto-import eligibility
- manual approve/reject behavior

Toàn bộ luồng cũ được chuyển nguyên trạng khỏi API route sang import service trước khi tiếp tục tối ưu nghiệp vụ. Vì vậy diff lớn chủ yếu là di chuyển code, không phải viết lại thuật toán.

## Hướng phát triển sau này

Chỉ tách thêm repository hoặc media orchestration khi một lỗi thực tế cho thấy `import-service.ts` còn khó theo dõi. Không chia parser thành quá nhiều file nhỏ; ưu tiên một nơi dễ tìm hơn là kiến trúc nhiều tầng.
