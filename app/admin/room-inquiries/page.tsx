import { redirect } from "next/navigation";
import { getAdminRequestContext } from "../request-context";
import RoomConsultRequestsClient from "./RoomConsultRequestsClient";

export default async function AdminRoomInquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>;
}) {
  const { level } = await getAdminRequestContext();
  if (!level) redirect("/");
  const params = await searchParams;
  return <RoomConsultRequestsClient backHref="/admin" focusRequestId={params.request} />;
}
