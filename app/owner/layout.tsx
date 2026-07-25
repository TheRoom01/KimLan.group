import { ReactNode } from "react";
import OwnerLayout from "../../components/owner/OwnerLayout";

export default function Layout({
  children,
}: {
  children: ReactNode;
}) {
  return <OwnerLayout>{children}</OwnerLayout>;
}