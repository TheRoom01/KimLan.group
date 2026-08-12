export type SalesRoomStatus = "Trống" | "Sắp trống" | "Đang thuê";

export type SalesPortalDocument = {
  id: string;
  title: string;
  description: string | null;
  file_name: string;
  file_url: string;
  mime_type: string | null;
  size_bytes: number | null;
};

export type SalesPortalRoom = {
  id: string;
  room_code: string | null;
  room_type: string | null;
  price: number | null;
  description: string | null;
  status: SalesRoomStatus;
  available_at: string | null;
  sales_note: string | null;
  room_details: Record<string, unknown> | null;
  media: Array<{ id: string; type: string; url: string; is_cover: boolean | null; sort_order: number | null }>;
};

export type SalesPortalData = {
  property: {
    id: string;
    code: string | null;
    name: string;
    full_address: string;
    cover_image: string | null;
    gallery_images: string[];
    google_maps_url: string | null;
    note: string | null;
  };
  building_info: {
    room_types: string[];
    min_price: number | null;
    max_price: number | null;
    amenities: string[];
    fees: Array<{ label: string; value: number; unit: string | null }>;
    other_fee_note: string | null;
    policy: string | null;
    contact_phones: string[];
  };
  documents: SalesPortalDocument[];
  rooms: SalesPortalRoom[];
  summary: Record<SalesRoomStatus, number>;
};
