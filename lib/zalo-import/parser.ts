export type ParsedZaloRoom = {
  roomPayload: Record<string, any>;
  detailPayload: Record<string, any>;
  confidenceScore: number;
  sourceFieldMap: Record<string, any>;
};

export function removeVietnameseTone(input: string) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

export function normalizeForCompare(input: string) {
  return removeVietnameseTone(input)
    .toLowerCase()
    .replace(/[,\n\r\t]+/g, " ")
    .replace(/[|;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeDistrict(input?: string | null) {
  const raw = String(input || "").trim();
  if (!raw) return "";

  const s = normalizeForCompare(raw);

  const qNum = s.match(/\b(?:q|quan)?\s*(\d{1,2})\b/);
  if (qNum?.[1]) return `Quận ${Number(qNum[1])}`;

  const map: Record<string, string> = {
    "binh thanh": "Bình Thạnh",
    "go vap": "Gò Vấp",
    "phu nhuan": "Phú Nhuận",
    "tan binh": "Tân Bình",
    "tan phu": "Tân Phú",
    "thu duc": "Thủ Đức",
    "binh tan": "Bình Tân",
  };

  return map[s] || raw;
}

export function normalizeWard(input?: string | null) {
  const raw = String(input || "").trim();
  if (!raw) return "";

  return raw
    .replace(/\b(?:p\.?|phường|phuong)\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeRoomCode(input?: string | null) {
  const raw = String(input || "").trim();
  if (!raw) return "";

  const x = raw
    .replace(/\b(?:phòng|phong|room|mã|ma)\b/gi, "")
    .replace(/[:\-\s]+/g, "")
    .replace(/^P(?=\d)/i, "P.")
    .toUpperCase();

  return x;
}

export function normalizeMoneyToVnd(input?: string | null) {
  const raw = String(input || "").trim();
  if (!raw) return null;

  const s = raw.replace(",", ".");
  const n = Number(s.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return null;

  if (/tr|triệu|trieu/i.test(raw)) return Math.round(n * 1_000_000);
  if (/k|nghìn|ngan|ngàn/i.test(raw)) return Math.round(n * 1_000);
  if (n < 1000) return Math.round(n * 1_000_000);

  return Math.round(n);
}

function titleCaseStreet(input: string) {
  const keepUpper = new Set(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
  return String(input || "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => {
      if (keepUpper.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function defaultRoomPayload(rawText: string): Record<string, any> {
  return {
    room_code: "",
    room_type: "",
    house_number: "",
    address: "",
    ward: "",
    district: "",
    price: null,
    status: "Trống",
    description: rawText,
    link_zalo: "",
    zalo_phone: "",
    chinh_sach: "",
  };
}

function defaultDetailPayload(): Record<string, any> {
  return {
    electric_fee_value: null,
    electric_fee_unit: "kWh",

    water_fee_value: null,
    water_fee_unit: "người/tháng",

    service_fee_value: null,
    service_fee_unit: "phòng/tháng",

    parking_fee_value: null,
    parking_fee_unit: "chiếc",

    other_fee_value: null,
    other_fee_note: "",

    has_elevator: false,
    has_stairs: false,
    shared_washer: false,
    private_washer: false,
    shared_dryer: false,
    private_dryer: false,
    has_parking: false,
    has_basement: false,
    fingerprint_lock: false,

    allow_pet: false,
    allow_cat: false,
    allow_dog: false,
    no_pet: false,

    short_term: false,
    long_term: true,

    other_amenities: "",
    detail_json: null,
  };
}

export function parseZaloRoomText(rawText: string): ParsedZaloRoom {
  const text = String(rawText || "").trim();
  const textNoTone = normalizeForCompare(text);

  const roomPayload = defaultRoomPayload(text);
  const detailPayload = defaultDetailPayload();
  const sourceFieldMap: Record<string, any> = {};

  const codeMatch =
    text.match(/\b(?:mã|ma|phòng|phong|room)\s*[:\-]?\s*([A-Z]?\s*\.?\s*\d{2,4}[A-Z]?)\b/i) ||
    text.match(/\b([A-Z]\.?\d{2,4}[A-Z]?)\b/i);

  if (codeMatch?.[1]) {
    roomPayload.room_code = normalizeRoomCode(codeMatch[1]);
    sourceFieldMap.room_code = "Tin Zalo";
  }

  const priceMatch =
    text.match(/(?:giá|gia)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*(tr|triệu|trieu|k|nghìn|ngan|ngàn)?/i) ||
    text.match(/(\d+(?:[.,]\d+)?)\s*(tr|triệu|trieu)\b/i);

  if (priceMatch?.[0]) {
    roomPayload.price = normalizeMoneyToVnd(priceMatch[0]);
    if (roomPayload.price) sourceFieldMap.price = "Tin Zalo";
  }

  const districtMatch =
    text.match(/\b(?:q\.?|quận|quan)\s*([0-9]{1,2}|bình thạnh|binh thanh|gò vấp|go vap|phú nhuận|phu nhuan|tân bình|tan binh|tân phú|tan phu|thủ đức|thu duc|bình tân|binh tan)\b/i);

  if (districtMatch?.[1]) {
    roomPayload.district = normalizeDistrict(districtMatch[1]);
    sourceFieldMap.district = "Tin Zalo";
  }

  const wardMatch = text.match(/\b(?:p\.?|phường|phuong)\s*([0-9]{1,3}|[A-Za-zÀ-ỹ\s]{3,30})(?=,|\n|\.|\-|q\.?|quận|quan|$)/i);
  if (wardMatch?.[1]) {
    roomPayload.ward = normalizeWard(wardMatch[1]);
    sourceFieldMap.ward = "Tin Zalo";
  }

  const addressMatch =
    text.match(/\b(\d+[A-Za-z]?(?:\/\d+[A-Za-z]?)?)\s+([A-Za-zÀ-ỹ\s]+?)(?=,|\n|\.|\s+q\.?|\s+quận|\s+quan|$)/i);

  if (addressMatch?.[1] && addressMatch?.[2]) {
    const street = addressMatch[2]
      .replace(/\b(?:phòng|phong|room|giá|gia|trống|trong|còn|con)\b.*$/i, "")
      .trim();

    if (street.length >= 3) {
      roomPayload.house_number = addressMatch[1].trim();
      roomPayload.address = titleCaseStreet(street);
      sourceFieldMap.house_number = "Tin Zalo";
      sourceFieldMap.address = "Tin Zalo";
    }
  }

  const phoneMatch = text.match(/(?:\+?84|0)(?:\d[\s.-]?){8,10}\d/);
  if (phoneMatch?.[0]) {
    roomPayload.zalo_phone = phoneMatch[0].replace(/[^\d+]/g, "");
    sourceFieldMap.zalo_phone = "Tin Zalo";
  }

  const electricMatch = text.match(/(?:điện|dien)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*(k|nghìn|ngan|ngàn)?/i);
  if (electricMatch?.[0]) {
    detailPayload.electric_fee_value = normalizeMoneyToVnd(electricMatch[0]);
    sourceFieldMap.electric_fee_value = "Tin Zalo";
  }

  const waterMatch = text.match(/(?:nước|nuoc)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*(k|nghìn|ngan|ngàn)?/i);
  if (waterMatch?.[0]) {
    detailPayload.water_fee_value = normalizeMoneyToVnd(waterMatch[0]);
    sourceFieldMap.water_fee_value = "Tin Zalo";
  }

  const serviceMatch = text.match(/(?:dịch vụ|dich vu|service)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*(k|nghìn|ngan|ngàn)?/i);
  if (serviceMatch?.[0]) {
    detailPayload.service_fee_value = normalizeMoneyToVnd(serviceMatch[0]);
    sourceFieldMap.service_fee_value = "Tin Zalo";
  }

  const parkingMatch = text.match(/(?:xe|giữ xe|giu xe|parking)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*(k|nghìn|ngan|ngàn)?/i);
  if (parkingMatch?.[0]) {
    detailPayload.parking_fee_value = normalizeMoneyToVnd(parkingMatch[0]);
    sourceFieldMap.parking_fee_value = "Tin Zalo";
  }

  if (/đã\s*thuê|da\s*thue|hết\s*phòng|het\s*phong/i.test(text)) {
    roomPayload.status = "Đã thuê";
    sourceFieldMap.status = "Tin Zalo";
  } else if (/trống|con trong|còn trống|available/i.test(textNoTone)) {
    roomPayload.status = "Trống";
    sourceFieldMap.status = "Tin Zalo";
  }

  if (/thang máy|thang may/i.test(text)) {
    detailPayload.has_elevator = true;
    sourceFieldMap.has_elevator = "Tin Zalo";
  }

  if (/nuôi mèo|nuoi meo|cho mèo|cho meo/i.test(textNoTone)) {
    detailPayload.allow_pet = true;
    detailPayload.allow_cat = true;
    detailPayload.no_pet = false;
    sourceFieldMap.allow_cat = "Tin Zalo";
  }

  if (/nuôi chó|nuoi cho|cho chó|cho cho/i.test(textNoTone)) {
    detailPayload.allow_pet = true;
    detailPayload.allow_dog = true;
    detailPayload.no_pet = false;
    sourceFieldMap.allow_dog = "Tin Zalo";
  }

  sourceFieldMap.description = "Tin Zalo";

  const filledCount = [
    roomPayload.room_code,
    roomPayload.house_number,
    roomPayload.address,
    roomPayload.district,
    roomPayload.price,
    roomPayload.zalo_phone,
    detailPayload.electric_fee_value,
    detailPayload.water_fee_value,
  ].filter(Boolean).length;

  return {
    roomPayload,
    detailPayload,
    confidenceScore: Math.min(0.9, 0.25 + filledCount * 0.08),
    sourceFieldMap,
  };
}