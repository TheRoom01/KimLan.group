import test from 'node:test';
import assert from 'node:assert/strict';
import { isAvailabilityDate, requireAvailabilityDate, roomStatusLabel, resolveRoomAvailability } from '../lib/rooms/availability.ts';

test('publishing uses midnight Vietnam time and clears due dates', () => {
  const before = new Date('2026-09-06T16:59:59Z');
  const midnight = new Date('2026-09-06T17:00:00Z');
  assert.deepEqual(resolveRoomAvailability('Sắp trống', '2026-09-07', before), {status:'Sắp trống', available_from:'2026-09-07'});
  for (const date of ['2026-09-06', '2026-09-07']) {
    assert.deepEqual(resolveRoomAvailability('Sắp trống', date, midnight), {status:'Đang trống', available_from:null});
  }
  assert.equal(resolveRoomAvailability('Sắp trống', '2026-09-08', midnight).status, 'Sắp trống');
});

test('upcoming badge displays day/month without changing the stored status', () => {
  assert.equal(roomStatusLabel('Sắp trống', '2026-10-01'), 'Sắp trống - 01/10');
  assert.equal(roomStatusLabel('Sắp trống', '2027-01-02'), 'Sắp trống - 02/01');
});
test('legacy upcoming rooms have no fabricated date', () => {
  assert.equal(roomStatusLabel('Sắp trống', null), 'Sắp trống');
  assert.equal(roomStatusLabel('Sắp trống', '2026-02-30'), 'Sắp trống');
});
test('other statuses do not show stale dates and clear them on save', () => {
  for (const status of ['Đang trống', 'Đã thuê']) {
    assert.equal(roomStatusLabel(status, '2026-10-01'), status);
    assert.equal(requireAvailabilityDate(status, '2026-10-01'), null);
  }
});
test('requires a real date for upcoming, including leap-year validation', () => {
  assert.equal(requireAvailabilityDate('Sắp trống', '2028-02-29'), '2028-02-29');
  for (const invalid of [null, undefined, '', '01/10/2026', '2026-02-29', '2026-13-01', '2026-10-01T00:00:00Z']) {
    assert.equal(isAvailabilityDate(invalid), false);
    assert.throws(() => requireAvailabilityDate('Sắp trống', invalid));
  }
});
