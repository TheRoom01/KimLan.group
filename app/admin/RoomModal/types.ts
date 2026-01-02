/* ================= TYPES ================= */

import type { RoomStatus } from '../../types/room'

export type TabKey = 'info' | 'fee' | 'amenity'
export type MediaItem = {
  type: "image" | "video";
  url: string;   // public url
  path: string;  // path trong bucket
};


export type RoomForm = {
  room_code: string
  room_type: string
  house_number: string
  address: string
  ward: string
  district: string
  price: number
  status: RoomStatus
  description: string
  gallery_urls: string
  media?: MediaItem[];
  link_zalo: string
  
}

export type RoomDetail = {
  room_id?: string

  electric_fee_value: number
  electric_fee_unit: string

  water_fee_value: number
  water_fee_unit: string

  service_fee_value: number
  service_fee_unit: string

  parking_fee_value: number
  parking_fee_unit: string

  other_fee_value: number
  other_fee_note: string

  /* ===== Amenities ===== */
  has_elevator: boolean
  has_stairs: boolean
  fingerprint_lock: boolean
  allow_cat: boolean
  allow_dog: boolean
  has_parking: boolean
  has_basement: boolean

  /* ===== Washer / Dryer ===== */
  shared_washer: boolean
  private_washer: boolean
  shared_dryer: boolean
  private_dryer: boolean

  other_amenities: string
}
