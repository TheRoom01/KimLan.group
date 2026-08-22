export type MapRoom = {
  id: string;
  room_code: string;
  room_type: string | null;
  price: number | null;
  status: string | null;
  address: string | null;
  ward: string | null;
  district: string | null;
  latitude: number;
  longitude: number;
  thumbnail: string | null;
  distance_km: number | null;
};

export type MapBounds = { west: number; south: number; east: number; north: number };
