import assert from 'node:assert/strict';
import { parseZaloRoomText, normalizeRoomCode } from '../../../lib/zalo-import/parser';
import { normalizedRoomIdentity } from '../../../lib/zalo-import/room-comparison';
import { analyzePhase2RoomMarkerMessage } from './phase2-room-marker';
import { buildSemanticTimelineRooms } from './index';

const building = '68/333 Trần Quang Khải, Tân Định, Q1\n- Phí dịch vụ: 200k/p\n- Giặt sấy chung tại căn\n- Phí điện: 4.000/Kwh\n- Phí nước: 150k/ng\n- Phí xe: free\n- Thang: bộ';
const marker = (code: string) => `Studio/CS - 6.200.000 - ${code} - trống 1/11`;
const source = (code: string) => `${building}\n\n${marker(code)}`;
const dotted = parseZaloRoomText(source('P.1.2'));
assert.deepEqual([dotted.roomPayload.house_number, dotted.roomPayload.address, dotted.roomPayload.ward, dotted.roomPayload.district, dotted.roomPayload.room_code, dotted.roomPayload.price, dotted.roomPayload.room_type], ['68/333', 'Trần Quang Khải', 'Tân Định', 'Quận 1', '1.2', 6200000, 'Studio']);
assert.equal(dotted.roomPayload.available_from_text, '1/11');
assert.equal(dotted.roomPayload.available_from, undefined, 'never invent the vacancy year');
assert.equal(dotted.detailPayload.has_stairs, true); assert.equal(dotted.detailPayload.has_window, true);
assert.equal(dotted.detailPayload.water_fee_value, 150000); assert.equal(dotted.detailPayload.water_fee_unit, 'người');
for (const [raw, expected] of [['P.1.2', '1.2'], ['p.1.2', '1.2'], ['1.2', '1.2'], ['P.1/2', '1/2'], ['P.A-01.B', 'A-01.B'], ['Suite Mặt tiền - A', 'Suite Mặt tiền - A'], ['P.1.2 (mã cũ)', '1.2 (mã cũ)']]) {
  assert.equal(parseZaloRoomText(source(raw)).roomPayload.room_code, expected, `form/reparse keeps the whole code field: ${raw}`);
  assert.equal(analyzePhase2RoomMarkerMessage(marker(raw))?.roomCode, expected, `Reader anchor keeps the same code: ${raw}`);
  assert.equal(normalizeRoomCode(expected), expected, 'resolver normalization must preserve punctuation and literal text');
}
assert.equal(normalizeRoomCode('Mã phòng: P.1.2'), '1.2');
assert.equal(parseZaloRoomText(`${source('P.1.2')}\nMã phòng: P.1.2`).roomPayload.room_code, '1.2');
assert.equal(parseZaloRoomText(`${building}\n\nPhòng: ${marker('P.1.2')}`).roomPayload.room_code, '1.2', 'a room-description label does not replace the actual code slot');
assert.notEqual(normalizedRoomIdentity(dotted.roomPayload), normalizedRoomIdentity({ ...dotted.roomPayload, room_code: '12' }));
assert.notEqual(normalizedRoomIdentity(dotted.roomPayload), normalizedRoomIdentity({ ...dotted.roomPayload, room_code: '1/2' }));
for (const value of ['Album 21 ảnh', '21 ảnh', 'video 26 giây', 'trống 21/11', '']) {
  assert.equal(parseZaloRoomText(source(value)).roomPayload.room_code, '', `do not invent a code from metadata, vacancy or an empty slot: ${value}`);
  assert.equal(analyzePhase2RoomMarkerMessage(marker(value))?.roomCode || '', '');
}
const message = (id: string, text: string, timestamp: number) => ({ msgId: id, cliMsgId: id, text, msgType: 1, kind: 'text', fromUid: 'fixture', sendDttm: timestamp, serverTime: timestamp, imageUrls: [], videoUrls: [], videoThumbUrls: [] }) as any;
const rooms = buildSemanticTimelineRooms({ groupName: 'Fixture', groupId: 'g-fixture', messages: [
  message('building', building, 1000), message('marker', marker('P.1.2'), 2000),
  { ...message('album', '', 3000), kind: 'image', msgType: 2, originMsgType: 'chat.photo', imageUrls: ['https://example.test/one.webp', 'https://example.test/two.webp'], totalImages: 2 },
] });
assert.equal(rooms.length, 1); assert.equal(rooms[0].roomCode, '1.2'); assert.equal(rooms[0].imageUrls.length, 2);
assert.equal(parseZaloRoomText(rooms[0].fullText).roomPayload.room_code, '1.2', 'Reader preview text must round-trip into the API parser');
const literalPlus = buildSemanticTimelineRooms({ groupName: 'Fixture', groupId: 'g-fixture', messages: [message('building', building, 1000), message('marker', marker('Suite A+B.1'), 2000)] });
assert.equal(literalPlus.length, 1, 'unknown code containing + is one literal field, not multiple guessed rooms');
assert.equal(literalPlus[0].roomCode, 'Suite A+B.1');
console.log('Room code 1.2 / whole unknown field / labelled code / identity separators / no media-count or date inference / forward album / Reader-to-API round trip: PASS (offline)');
