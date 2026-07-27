import type { RoomStatus } from "@/lib/owner/types";

export type { RoomStatus } from "@/lib/owner/types";

export type TabKey = "info" | "fee" | "amenity";

export type Room = {
  id: string;
  room_code: string;
  house_number?: string | null;
  address?: string | null;
  ward?: string | null;
  district?: string | null;
  price?: number | null;
  status?: RoomStatus | null;
  created_at?: string | null;
  link_zalo?: string | null;
  updated_at?: string | null;
  chinh_sach?: string | null;
  image_urls?: string[] | null;
  image_count?: number | null;
  room_type?: string | null;
  description?: string | null;
  shared_washer: boolean | null;
  private_washer: boolean | null;
  shared_dryer: boolean | null;
  private_dryer: boolean | null;
  has_parking: boolean | null;
  has_basement: boolean | null;
};
