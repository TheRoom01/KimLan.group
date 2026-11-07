import { redirect } from "next/navigation";
import { getAdminRequestContext } from "../request-context";
import AdminNotificationsClient from "./AdminNotificationsClient";

export default async function AdminNotificationsPage() {
  const { level } = await getAdminRequestContext();
  if (!level) redirect("/");
  return <AdminNotificationsClient />;
}
