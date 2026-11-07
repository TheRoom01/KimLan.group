import { redirect } from "next/navigation";
import { getAdminRequestContext } from "../request-context";
import { canAccessZaloImports } from "@/lib/zalo-import/access";
import ZaloImportsClient from "./ZaloImportsClient";

export default async function ZaloImportsPage() {
  const { user, level } = await getAdminRequestContext();
  if (!level || !canAccessZaloImports(user)) redirect("/");

  return <ZaloImportsClient />;
}
