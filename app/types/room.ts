export type TabKey = 'info' | 'fee' | 'amenity'
export type RoomStatus = 'Trống' | 'Đã thuê' | 'Ẩn'

export type Room = {
  id: string
  room_code: string
  house_number?: string | null
  address?: string | null
  ward?: string | null
  district?: string | null
  price?: number | null
  status?: RoomStatus | null
  created_at?: string | null
  link_zalo?: string | null
  updated_at?: string | null
   chinh_sach?: string | null

  // ✅ NEW (list/detail lấy từ room_media qua RPC)
  image_urls?: string[] | null
  image_count?: number | null

  // nếu có dùng ở modal thì để thêm:
  room_type?: string | null
  description?: string | null

  shared_washer: boolean | null
private_washer: boolean| null
shared_dryer: boolean| null
private_dryer: boolean| null
has_parking: boolean| null
has_basement: boolean| null
}
