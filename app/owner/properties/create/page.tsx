import Link from "next/link";

import CreatePropertyForm from "@/components/owner/CreatePropertyForm";

export default function CreatePropertyPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Tạo tòa nhà</h1>
          <p className="mt-1 text-gray-500">
            Khai báo thông tin cơ bản để gửi tòa nhà vào hàng chờ duyệt.
          </p>
        </div>

        <Link
          href="/owner/properties"
          className="text-sm font-medium text-gray-600 hover:text-black"
        >
          ← Danh sách tòa nhà
        </Link>
      </div>

      <CreatePropertyForm />
    </div>
  );
}
