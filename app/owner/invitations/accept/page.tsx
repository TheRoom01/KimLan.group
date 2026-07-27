import Link from "next/link";

import AcceptInvitationCard from "@/components/owner/AcceptInvitationCard";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token || !UUID_PATTERN.test(token)) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">Link lời mời không hợp lệ</h1>
        <p className="mt-3 text-gray-600">
          Link bị thiếu token hoặc token không đúng định dạng.
        </p>
        <Link
          href="/owner/properties"
          className="mt-5 inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
        >
          Về danh sách tòa nhà
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl py-8">
      <AcceptInvitationCard token={token} />
    </div>
  );
}
