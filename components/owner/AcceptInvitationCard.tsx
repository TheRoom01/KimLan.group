"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { readApiResponse } from "@/lib/api/client";

type AcceptInvitationResult = {
  ok?: boolean;
  property_id?: string;
};

export default function AcceptInvitationCard({ token }: { token: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function acceptInvitation() {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/owner/invitations/accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });

      const result = await readApiResponse<AcceptInvitationResult>(response);
      const propertyId = result.property_id;

      if (!propertyId) {
        throw new Error("API không trả về tòa nhà của lời mời");
      }

      router.push(`/owner/properties/${propertyId}`);
      router.refresh();
    } catch (acceptError) {
      setError(
        acceptError instanceof Error
          ? acceptError.message
          : "Không thể chấp nhận lời mời",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold">Lời mời tham gia tòa nhà</h1>
      <p className="mt-3 text-gray-600">
        Khi chấp nhận, tài khoản đang đăng nhập sẽ được thêm theo vai trò ghi trong
        lời mời. Email hoặc số điện thoại của tài khoản phải trùng với thông tin trên lời mời.
      </p>

      {error ? (
        <div
          role="alert"
          className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void acceptInvitation()}
          disabled={submitting}
          className="rounded-lg bg-black px-5 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Đang xác nhận..." : "Chấp nhận lời mời"}
        </button>

        <Link
          href="/owner/properties"
          className="rounded-lg border px-5 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Về danh sách tòa nhà
        </Link>
      </div>
    </div>
  );
}
