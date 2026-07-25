export interface Property {
  id: string;

  code: string;

  name: string;

  property_key: string;

  house_number: string | null;

  address: string | null;

  ward: string | null;

  district: string | null;

  city: string | null;

  latitude: number | null;

  longitude: number | null;

  cover_image: string | null;

  note: string | null;

  status: string;

  created_at: string;

  updated_at: string;
}