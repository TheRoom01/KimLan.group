HOTFIX TEST CUỐI

Sửa 2 lỗi:

1. semantic-parser-smoke-test.ts
   Test cũ mong 503 + 803 là 1 phòng.
   Kiến trúc mới tách thành 2 phòng dùng chung marker và album.
   Tổng record case đó là 3:
   - 902
   - 503
   - 803

2. phase3-message-lookback-smoke-test.ts
   Thêm type cast:
   filtered.messages as SemanticIndexedDbMessage[]

Cách chạy:

node tools/zalo-reader/apply-hotfix-final-tests.mjs
npm run test:zalo-parser
npm run test:zalo-lookback
npm run build:webpack
