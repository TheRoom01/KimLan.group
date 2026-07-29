import { apiError } from "@/lib/api/response";
export async function PATCH(){return apiError("NOT_FOUND","API doanh thu cũ đã được thay bằng /api/owner/revenues",410)}
export const DELETE=PATCH;
