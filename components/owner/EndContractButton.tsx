"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { readApiResponse } from "@/lib/api/client";

export default function EndContractButton({
  contractId,
}: {
  contractId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function endContract() {
    const confirmed = window.confirm(
      "Bạn chắc chắn muốn kết thúc hợp đồng?",
    );

    if (!confirmed) return;

    try {
      setLoading(true);
      setErrorMessage(null);

      const response = await fetch(
        `/api/owner/contracts/${contractId}/end`,
        { method: "POST" },
      );

      await readApiResponse(response);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Kết thúc hợp đồng thất bại",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={endContract}
        disabled={loading}
        className="rounded-lg bg-red-600 px-4 py-2 text-white disabled:opacity-50"
      >
        {loading ? "Đang xử lý..." : "Kết thúc hợp đồng"}
      </button>

      {errorMessage && (
        <p className="text-sm text-red-600">{errorMessage}</p>
      )}
    </div>
  );
}
