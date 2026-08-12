import type { Metadata } from "next";
import { notFound } from "next/navigation";

import SalesPortalView from "@/components/sales/SalesPortalView";
import { getSalesPortalData } from "@/lib/sales-portal/getSalesPortalData";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Thông tin Sale",
  robots: { index: false, follow: false },
};

export default async function SalesPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getSalesPortalData(token);
  if (!data) notFound();
  return <SalesPortalView data={data} />;
}
