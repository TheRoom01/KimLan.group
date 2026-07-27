import Link from "next/link";

import CreatePropertyForm from "@/components/owner/CreatePropertyForm";

export default function CreatePropertyPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            Thêm tòa nhà
          </h1>

          <p className="mt-1 text-gray-500">
            Hệ thống sẽ tự kiểm tra tòa nhà theo địa chỉ.
            Nếu đã tồn tại, yêu cầu đồng sở hữu sẽ được gửi
            đến chủ sở hữu hiện tại để xác nhận.
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