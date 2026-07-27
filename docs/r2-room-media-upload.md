# R2 room media upload

Room images and videos use the bucket `rooms-media`.

## Required environment variables

```env
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_PUBLIC_BASE_URL=https://your-public-r2-domain.example.com
```

`R2_PUBLIC_BASE_URL` must not point to the S3 API endpoint. It must be the public/custom domain used to read objects.

## Required Cloudflare R2 CORS policy

Replace the production origins with the actual application origins. Keep localhost only for local development.

```json
[
  {
    "AllowedOrigins": [
      "https://your-production-domain.example.com",
      "https://www.your-production-domain.example.com",
      "http://localhost:3000"
    ],
    "AllowedMethods": [
      "GET",
      "HEAD",
      "PUT"
    ],
    "AllowedHeaders": [
      "Content-Type",
      "Cache-Control"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

The browser uploads directly to the presigned URL. The request must be a raw `PUT` whose body is the `File`; do not wrap it in `FormData`.

The client must send every header returned by `/api/upload/r2-presign` in `requiredHeaders`. The signature currently includes:

```text
Content-Type
Cache-Control
```

Omitting or changing a signed header can produce an R2 `403 SignatureDoesNotMatch` response. A missing CORS rule usually appears in the browser as `TypeError: Failed to fetch` or a blocked preflight request.

## Size limits

- Images in Owner Portal: 15 MB per file.
- Videos: 50 MB per file.
- Maximum selection in Owner Portal: 20 files.
- The same-origin `/api/upload/r2` fallback is only appropriate for small files. Large videos must use direct presigned upload because serverless request payload limits are lower than the supported video size.

## Storage layout

```text
rooms/{room_id}/images/{uuid}.{extension}
rooms/{room_id}/video/{uuid}.{extension}
rooms/{room_id}/images/thumb.webp
```

After R2 returns success, the application records the object in `public.room_media`. The database record is not written before a successful R2 `PUT`.

## Diagnostic sequence

1. Confirm `/api/upload/r2-presign` returns HTTP 200 with `uploadUrl`, `publicUrl`, `key`, and `requiredHeaders`.
2. In browser DevTools, inspect the `OPTIONS` preflight to the R2 host. It must return an allowed origin, method `PUT`, and both required headers.
3. Inspect the `PUT`. Send the file directly and copy `requiredHeaders` exactly.
4. Confirm the public URL returns the uploaded object.
5. Confirm `room_media.path` begins with `rooms/{room_id}/` and `provider = 'r2'`.
