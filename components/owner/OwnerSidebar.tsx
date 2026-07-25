"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const menus = [
  {
    title: "Dashboard",
    href: "/owner",
  },
  {
    title: "Tòa nhà",
    href: "/owner/properties",
  },
  {
    title: "Phòng",
    href: "/owner/rooms",
  },
  {
    title: "Khách thuê",
    href: "/owner/tenants",
  },
  {
    title: "Hợp đồng",
    href: "/owner/contracts",
  },
];

export default function OwnerSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r bg-white">
      <div className="border-b p-6 text-xl font-bold">
        Owner Portal
      </div>

      <nav className="flex flex-col">
        {menus.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`px-6 py-4 transition ${
              pathname === item.href
                ? "bg-blue-500 text-white"
                : "hover:bg-gray-100"
            }`}
          >
            {item.title}
          </Link>
        ))}
      </nav>
    </aside>
  );
}