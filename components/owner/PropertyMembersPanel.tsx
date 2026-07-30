"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { readApiResponse } from "@/lib/api/client";

export type PropertyMemberItem = {
  id?: string;
  user_id?: string;
  role?: string;
  status?: string;
  display_name?: string | null;
  email?: string | null;
};

type MemberMutationResult = {
  ok?: boolean;
  member?: PropertyMemberItem;
};

type OwnershipTransferResult = {
  ok?: boolean;
  previous_owner?: PropertyMemberItem;
  new_owner?: PropertyMemberItem;
};

export default function PropertyMembersPanel({
  propertyId,
  currentUserId,
  initialMembers,
  isOwner,
}: {
  propertyId: string;
  currentUserId?: string | null;
  initialMembers: PropertyMemberItem[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function memberLabel(member: PropertyMemberItem) {
    if (member.user_id === currentUserId) return "Tài khoản của bạn";
    return member.display_name || member.email || "Thành viên";
  }

  async function updateRole(member: PropertyMemberItem) {
    if (!member.id) return;

    const role = roleDrafts[member.id] ?? member.role ?? "manager";
    setBusyKey(`role:${member.id}`);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/owner/properties/${propertyId}/members/${member.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ role }),
        },
      );
      const result = await readApiResponse<MemberMutationResult>(response);
      const updatedMember = result.member;

      if (!updatedMember?.id) {
        throw new Error("API không trả về membership đã cập nhật");
      }

      setMembers((current) =>
        current.map((item) =>
          item.id === updatedMember.id ? { ...item, ...updatedMember } : item,
        ),
      );
      setNotice("Đã cập nhật role thành viên.");
      router.refresh();
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Không thể cập nhật role thành viên",
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function revokeMember(member: PropertyMemberItem) {
    if (!member.id) return;

    const confirmed = window.confirm(
      `Thu hồi quyền truy cập của ${memberLabel(member)}?`,
    );
    if (!confirmed) return;

    setBusyKey(`revoke:${member.id}`);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/owner/properties/${propertyId}/members/${member.id}`,
        { method: "DELETE" },
      );
      const result = await readApiResponse<MemberMutationResult>(response);
      const updatedMember = result.member;

      setMembers((current) =>
        current.map((item) =>
          item.id === member.id
            ? { ...item, ...(updatedMember ?? {}), status: "revoked" }
            : item,
        ),
      );
      setNotice("Đã thu hồi quyền truy cập của thành viên.");
      router.refresh();
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Không thể thu hồi membership",
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function transferOwnership(member: PropertyMemberItem) {
    if (!member.id) return;

    const confirmed = window.confirm(
      `Chuyển quyền owner cho ${memberLabel(member)}? Sau thao tác này tài khoản của bạn sẽ trở thành manager.`,
    );
    if (!confirmed) return;

    setBusyKey(`transfer:${member.id}`);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/owner/properties/${propertyId}/members/${member.id}/transfer`,
        { method: "POST" },
      );
      const result = await readApiResponse<OwnershipTransferResult>(response);

      setMembers((current) =>
        current.map((item) => {
          if (item.id === result.previous_owner?.id) {
            return { ...item, ...result.previous_owner };
          }
          if (item.id === result.new_owner?.id) {
            return { ...item, ...result.new_owner };
          }
          return item;
        }),
      );
      setNotice("Đã chuyển quyền owner. Tài khoản của bạn hiện là manager.");
      router.refresh();
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Không thể chuyển quyền owner",
      );
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className="rounded-[22px] border border-[#956b45]/25 bg-[#fff9ef] p-5 text-[#432918] shadow-[0_10px_25px_rgba(92,61,34,0.06)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Thành viên tòa nhà</h2>
          <p className="mt-1 text-sm text-[#80634a]">
            Owner có thể đổi role, thu hồi quyền hoặc chuyển quyền sở hữu cho một
            thành viên active khác.
          </p>
        </div>
        <span className="rounded-full bg-[#f8ead7] px-3 py-1 text-xs font-bold text-[#684324]">{members.length} thành viên</span>
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {notice}
        </div>
      ) : null}

      {members.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-[#a9825f]/35 p-4 text-sm text-[#80634a]">
          Chưa có membership.
        </p>
      ) : (
        <div className="mt-4 grid gap-2">
          {members.map((member, index) => {
            const memberKey = member.id ?? `${member.user_id}-${index}`;
            const isActive = member.status === "active";
            const isTargetOwner = member.role === "owner";
            const canMutate =
              isOwner &&
              Boolean(member.id) &&
              isActive &&
              !isTargetOwner &&
              member.user_id !== currentUserId;
            const selectedRole = member.id
              ? roleDrafts[member.id] ?? member.role ?? "manager"
              : member.role ?? "manager";

            return (
              <div key={memberKey} className="rounded-2xl border border-[#aa825d]/20 bg-[#f8ead7]/65 p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#4d3422]">{memberLabel(member)}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                      <RoleBadge role={member.role} />
                      <StatusBadge status={member.status} />
                    </div>
                  </div>

                  {canMutate ? (
                    <div className="flex flex-wrap gap-1.5 sm:items-center">
                      <select
                        value={selectedRole}
                        onChange={(event) =>
                          member.id
                            ? setRoleDrafts((current) => ({
                                ...current,
                                [member.id as string]: event.target.value,
                              }))
                            : undefined
                        }
                        disabled={busyKey !== null}
                        aria-label={`Role của ${memberLabel(member)}`}
                        className="h-9 rounded-lg border border-[#aa825d]/30 bg-[#fffdf8] px-2 text-xs"
                      >
                        <option value="manager">Manager</option>
                        <option value="viewer">Viewer</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => void updateRole(member)}
                        disabled={busyKey !== null || selectedRole === member.role}
                        className="h-9 rounded-lg border border-[#aa825d]/30 bg-[#fffdf8] px-2.5 text-xs font-semibold hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busyKey === `role:${member.id}` ? "Đang lưu..." : "Lưu role"}
                      </button>

                      <button
                        type="button"
                        onClick={() => void transferOwnership(member)}
                        disabled={busyKey !== null}
                        className="h-9 rounded-lg border border-amber-300 bg-amber-50 px-2.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                      >
                        {busyKey === `transfer:${member.id}`
                          ? "Đang chuyển..."
                          : "Chuyển owner"}
                      </button>

                      <button
                        type="button"
                        onClick={() => void revokeMember(member)}
                        disabled={busyKey !== null}
                        className="h-9 rounded-lg border border-red-200 bg-red-50 px-2.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        {busyKey === `revoke:${member.id}`
                          ? "Đang thu hồi..."
                          : "Thu hồi"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function RoleBadge({ role }: { role?: string }) {
  const labels: Record<string, string> = {
    owner: "Owner",
    manager: "Manager",
    viewer: "Viewer",
  };

  return (
    <span className="rounded-full bg-[#eadbc8] px-2.5 py-0.5 font-semibold text-[#684324]">
      {labels[role ?? ""] ?? role ?? "Không rõ role"}
    </span>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const styles: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    pending: "bg-amber-100 text-amber-800",
    suspended: "bg-orange-100 text-orange-800",
    revoked: "bg-gray-100 text-gray-700",
  };
  const labels: Record<string, string> = {
    active: "Active",
    pending: "Pending",
    suspended: "Suspended",
    revoked: "Revoked",
  };
  const value = status ?? "unknown";

  return (
    <span
      className={`rounded-full px-2.5 py-0.5 font-semibold ${styles[value] ?? "bg-gray-100 text-gray-700"}`}
    >
      {labels[value] ?? value}
    </span>
  );
}
