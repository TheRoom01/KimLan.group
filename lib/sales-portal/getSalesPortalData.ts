import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { cache } from "react";
import { resolveGoogleMapsUrl } from "@/lib/roomActionLinks";

import { hashSalesPortalToken, isSalesPortalToken } from "./token";
import type { SalesPortalData, SalesPortalRoom, SalesRoomStatus } from "./types";

const ACTIVE_CONTRACT_STATUSES = new Set(["active", "pending", "Đang hiệu lực", "Chờ nhận phòng"]);

export const getSalesPortalData = cache(async function getSalesPortalData(token: string): Promise<SalesPortalData | null> {
  if (!isSalesPortalToken(token)) return null;
  const supabase = createSupabaseAdminClient();
  const now = new Date();
  const { data: link } = await supabase
    .from("sales_portal_links")
    .select("id, property_id, expires_at, revoked_at")
    .eq("token_hash", hashSalesPortalToken(token))
    .maybeSingle();

  if (!link || link.revoked_at || (link.expires_at && new Date(link.expires_at) <= now)) return null;

  const [propertyResult, documentsResult, roomsResult, notesResult] = await Promise.all([
    supabase.from("properties").select("id, code, name, house_number, address, ward, district, city, latitude, longitude, cover_image, gallery_images, google_maps_url, note, default_room_data, lifecycle_status").eq("id", link.property_id).eq("lifecycle_status", "active").maybeSingle(),
    supabase.from("sales_portal_link_documents").select("property_documents(id, title, description, file_name, file_url, mime_type, size_bytes, sort_order, created_at)").eq("link_id", link.id),
    supabase.from("rooms").select("id, room_code, room_type, price, description, chinh_sach, zalo_phone, status, lifecycle_status, room_details(*), room_media(id,type,url,is_cover,sort_order), rental_contracts(id,status,start_date,end_date,created_at)").eq("property_id", link.property_id).eq("lifecycle_status", "active").order("room_code"),
    supabase.from("sales_room_notes").select("room_id, note").eq("property_id", link.property_id),
  ]);

  if (propertyResult.error || !propertyResult.data || documentsResult.error || roomsResult.error || notesResult.error) {
    console.error("Sales Portal data error", propertyResult.error ?? documentsResult.error ?? roomsResult.error ?? notesResult.error);
    return null;
  }

  const { error: accessTouchError } = await supabase
    .from("sales_portal_links")
    .update({ last_accessed_at: now.toISOString(), updated_at: now.toISOString() })
    .eq("id", link.id);
  if (accessTouchError) console.error("Sales Portal access timestamp error", accessTouchError);
  const notes = new Map((notesResult.data ?? []).map((item) => [item.room_id, item.note]));
  const rooms: SalesPortalRoom[] = (roomsResult.data ?? []).map((room) => {
    const contracts = [...(room.rental_contracts ?? [])]
      .filter((contract) => ACTIVE_CONTRACT_STATUSES.has(String(contract.status ?? "")))
      .sort((left, right) => contractPriority(left.status) - contractPriority(right.status) || String(right.start_date ?? right.created_at ?? "").localeCompare(String(left.start_date ?? left.created_at ?? "")));
    const contract = contracts[0];
    const status = salesStatus(room.status, contract?.status, contract?.end_date);
    return {
      id: room.id,
      room_code: room.room_code,
      room_type: room.room_type,
      price: room.price == null ? null : Number(room.price),
      description: room.description,
      status,
      available_at: status === "Sắp trống" ? contract?.end_date ?? null : null,
      sales_note: notes.get(room.id) ?? null,
      room_details: first(room.room_details) as Record<string, unknown> | null,
      media: [...(room.room_media ?? [])].sort((a, b) => Number(Boolean(b.is_cover)) - Number(Boolean(a.is_cover)) || Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)),
    };
  });

  const p = propertyResult.data;
  const defaults = asRecord(p.default_room_data);
  const defaultDetails = asRecord(defaults.room_details);
  const roomTypes = uniqueStrings(rooms.map((room) => room.room_type));
  const prices = rooms.map((room) => room.price).filter((value): value is number => value != null);
  const contactPhones = uniqueStrings([
    ...String(defaults.zalo_phone ?? "").split(/[\n,;]/),
    ...(roomsResult.data ?? []).flatMap((room) => String(room.zalo_phone ?? "").split(/[\n,;]/)),
  ]);
  const fullAddress = [p.house_number, p.address, p.ward, p.district, p.city].filter(Boolean).join(", ");
  const summary: Record<SalesRoomStatus, number> = { "Trống": 0, "Sắp trống": 0, "Đang thuê": 0 };
  rooms.forEach((room) => { summary[room.status] += 1; });

  return {
    property: {
      id: p.id,
      code: p.code,
      name: String(p.name || fullAddress || "Tòa nhà"),
      full_address: fullAddress,
      cover_image: p.cover_image,
      gallery_images: Array.isArray(p.gallery_images) ? p.gallery_images.filter((item): item is string => typeof item === "string") : [],
      google_maps_url: resolveGoogleMapsUrl({
        latitude: p.latitude,
        longitude: p.longitude,
        googleMapsUrl: p.google_maps_url,
        address: fullAddress,
      }) || null,
      note: p.note,
    },
    building_info: {
      room_types: roomTypes,
      min_price: prices.length ? Math.min(...prices) : null,
      max_price: prices.length ? Math.max(...prices) : null,
      amenities: buildingAmenities(defaultDetails),
      fees: buildingFees(defaultDetails),
      other_fee_note: stringOrNull(defaultDetails.other_fee_note),
      policy: stringOrNull(defaults.chinh_sach) ?? uniqueStrings((roomsResult.data ?? []).map((room) => room.chinh_sach))[0] ?? null,
      contact_phones: contactPhones,
    },
    documents: (documentsResult.data ?? [])
      .flatMap((selection) => {
        const value = selection.property_documents;
        return Array.isArray(value) ? value : value ? [value] : [];
      })
      .sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0) || String(right.created_at ?? "").localeCompare(String(left.created_at ?? "")))
      .map(({ sort_order: _sortOrder, created_at: _createdAt, ...document }) => ({ ...document, size_bytes: document.size_bytes == null ? null : Number(document.size_bytes) })),
    rooms,
    summary,
  };
});

function first(value: unknown) { return Array.isArray(value) ? value[0] ?? null : value ?? null; }
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stringOrNull(value: unknown) { const text = String(value ?? "").trim(); return text || null; }
function uniqueStrings(values: unknown[]) { return Array.from(new Set(values.map(stringOrNull).filter((value): value is string => Boolean(value)))); }
function buildingAmenities(details: Record<string, unknown>) {
  const labels: Array<[string, string]> = [
    ["has_elevator", "Thang máy"], ["has_stairs", "Cầu thang bộ"], ["shared_washer", "Máy giặt chung"],
    ["private_washer", "Máy giặt riêng"], ["shared_dryer", "Máy sấy chung"], ["private_dryer", "Máy sấy riêng"],
    ["has_parking", "Chỗ để xe"], ["has_basement", "Hầm xe"], ["fingerprint_lock", "Khóa vân tay"],
    ["free_time", "Giờ giấc tự do"], ["allow_pet", "Cho nuôi thú cưng"], ["allow_cat", "Cho nuôi mèo"],
    ["allow_dog", "Cho nuôi chó"], ["short_term", "Thuê ngắn hạn"], ["long_term", "Thuê dài hạn"],
  ];
  return uniqueStrings([...labels.filter(([key]) => Boolean(details[key])).map(([, label]) => label), ...String(details.other_amenities ?? "").split(/[\n,;]+/)]);
}
function buildingFees(details: Record<string, unknown>) {
  const fields: Array<[string, string, string]> = [
    ["electric_fee_value", "Điện", "electric_fee_unit"], ["water_fee_value", "Nước", "water_fee_unit"],
    ["parking_fee_value", "Giữ xe", "parking_fee_unit"], ["service_fee_value", "Dịch vụ", "service_fee_unit"],
    ["other_fee_value", "Phí khác", "other_fee_unit"],
  ];
  return fields.flatMap(([valueKey, label, unitKey]) => {
    const value = Number(details[valueKey]);
    return Number.isFinite(value) && value >= 0 ? [{ label, value, unit: stringOrNull(details[unitKey]) }] : [];
  });
}
function contractPriority(status: unknown) { return ["active", "Đang hiệu lực"].includes(String(status ?? "")) ? 0 : 1; }
function salesStatus(stored: unknown, contractStatus?: unknown, endDate?: string | null): SalesRoomStatus {
  if (["active", "Đang hiệu lực"].includes(String(contractStatus ?? ""))) {
    if (endDate) {
      const days = Math.ceil((new Date(`${endDate}T00:00:00`).getTime() - Date.now()) / 86400000);
      if (days >= 0 && days <= 30) return "Sắp trống";
    }
    return "Đang thuê";
  }
  if (["pending", "Chờ nhận phòng"].includes(String(contractStatus ?? ""))) return "Đang thuê";
  if (String(stored ?? "") === "Sắp trống") return "Sắp trống";
  if (String(stored ?? "") === "Đã thuê") return "Đang thuê";
  return "Trống";
}
