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
  { key: 'fingerprint_lock', label: 'Khóa cửa vân tay' },
  { key: 'free_time', label: 'Giờ giấc tự do' },
  { key: 'no_live_in_landlord', label: 'Không chung chủ' },
  { key: 'has_stairs', label: 'Thang bộ' },
  { key: 'has_elevator', label: 'Thang máy' },
  { key: 'no_pet', label: 'Không thú cưng' },
  { key: 'allow_cat', label: 'Cho nuôi mèo' },
  { key: 'allow_dog', label: 'Cho nuôi chó' },
  { key: 'short_term', label: 'Ngắn hạn' },
  { key: 'has_basement', label: 'Có hầm xe' },
  { key: 'has_parking', label: 'Có chỗ gửi xe' },
  { key: 'long_term', label: 'Dài hạn' },
  { key: 'private_washer', label: 'Máy giặt riêng' },
  { key: 'shared_washer', label: 'Máy giặt chung' },
  { key: 'accepts_foreign_tenants', label: 'Nhận khách nước ngoài' },
  { key: 'private_dryer', label: 'Máy sấy riêng' },
  { key: 'shared_dryer', label: 'Máy sấy chung' },
  { key: 'has_balcony', label: 'Ban công' },
  { key: 'has_window', label: 'Cửa sổ' },
]
