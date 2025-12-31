import type { RoomDetail } from './types'

/* ================= FEE CONFIG ================= */

export const feeConfig = [
  { label: 'Tiền điện', valueKey: 'electric_fee_value', unitKey: 'electric_fee_unit' },
  { label: 'Tiền nước', valueKey: 'water_fee_value', unitKey: 'water_fee_unit' },
  { label: 'Phí dịch vụ', valueKey: 'service_fee_value', unitKey: 'service_fee_unit' },
  { label: 'Giữ xe', valueKey: 'parking_fee_value', unitKey: 'parking_fee_unit' },
] as const

/* ================= AMENITY CONFIG ================= */

// chỉ cho phép các key boolean của RoomDetail
type AmenityBooleanKey = {
  [K in keyof RoomDetail]-?: RoomDetail[K] extends boolean ? K : never
}[keyof RoomDetail]

// ✅ cấu hình tiện ích (key chắc chắn không undefined)
export const amenityConfig: Array<{ key: AmenityBooleanKey; label: string }> = [
  /* ===== CƠ BẢN ===== */
  { key: 'has_elevator', label: 'Thang máy' },
  { key: 'has_stairs', label: 'Thang bộ' },
  { key: 'fingerprint_lock', label: 'Khoá cửa vân tay' },

  /* ===== THÚ CƯNG ===== */
  { key: 'allow_cat', label: 'Cho nuôi mèo' },
  { key: 'allow_dog', label: 'Cho nuôi chó' },

  /* ===== GỬI XE ===== */
  { key: 'has_parking', label: 'Có chỗ gửi xe' },
  { key: 'has_basement', label: 'Có hầm để xe' },

  /* ===== GIẶT / SẤY ===== */
  { key: 'private_washer', label: 'Có máy giặt riêng' },
  { key: 'shared_washer', label: 'Có máy giặt chung' },
  { key: 'private_dryer', label: 'Có máy sấy riêng' },
  { key: 'shared_dryer', label: 'Có máy sấy chung' },
]
