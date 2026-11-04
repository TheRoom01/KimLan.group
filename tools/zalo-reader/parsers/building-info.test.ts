import assert from 'node:assert/strict';
import { parseZaloRoomText } from '../../../lib/zalo-import/parser';

const building = `236/61 Điện Biên Phủ, Bình Thạnh
- Phí dịch vụ: 200k/p
- Phí điện: 4.000/Kwh
- Phí nước: 100k/ng
- Phí xe: free
- Thang: bộ
- Có máy giặt riêng
- Dọn phòng 2 lần/tuần`;
for (const separator of ['\n', '\n\n']) {
  for (const suffix of ['', '\nMã phòng: P.101']) {
    const { roomPayload: room, detailPayload: detail } = parseZaloRoomText(`${building}${separator}1PN/BC/1PK - 11.500.000 - trống${suffix}`);
    assert.equal(room.house_number, '236/61');
    assert.equal(room.address, 'Điện Biên Phủ');
    assert.equal(room.district, 'Bình Thạnh');
    assert.equal(room.price, 11500000);
    assert.equal(detail.electric_fee_value, 4000);
    assert.equal(detail.water_fee_value, 100000);
    assert.equal(detail.service_fee_value, 200000);
    assert.equal(detail.has_stairs, true);
    assert.equal(detail.private_washer, true);
    assert.equal(detail.has_balcony, true);
    assert.match(detail.other_amenities, /Dọn phòng 2 lần\/tuần/);
    assert.match(detail.other_amenities, /1 phòng khách/);
    assert.doesNotMatch(detail.other_amenities, /Điện Biên Phủ|Phí |Thang|máy giặt|11.500.000|Mã phòng/);
  }
}
const extra = parseZaloRoomText(`${building}\n- Sân phơi trên sân thượng\n- Khu sinh hoạt chung\n- Camera an ninh\n- Khóa vân tay\n- Giờ giấc tự do\n- Cọc 1 tháng\n- Liên hệ Zalo 0901234567\n\nStudio - 5tr - trống - View đẹp`);
assert.match(extra.detailPayload.other_amenities, /Sân phơi trên sân thượng/);
assert.match(extra.detailPayload.other_amenities, /Khu sinh hoạt chung/);
assert.match(extra.detailPayload.other_amenities, /Camera an ninh/);
assert.doesNotMatch(extra.detailPayload.other_amenities, /Khóa vân tay|Giờ giấc|Cọc|Liên hệ|View đẹp/);
assert.equal(extra.roomPayload.description, 'View đẹp');
for (const invalid of ['4000 điện/kwh', '100 nước/người']) {
  assert.equal(parseZaloRoomText(invalid).roomPayload.house_number, '');
}
console.log('Building info: Điện Biên Phủ address, structured fees/amenities and unmodelled building information PASS');
