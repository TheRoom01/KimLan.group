"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { readApiResponse } from "@/lib/api/client";

type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

type PropertyInvitation = {
  id: string;
  token: string;
  invitee_name?: string | null;
  invited_email?: string | null;
  invited_phone?: string | null;
  role: string;
  status: InvitationStatus;
  expires_at: string;
  accepted_at?: string | null;
  revoked_at?: string | null;
  created_at: string;
};

type InviteResult = {
  ok?: boolean;
  invitation?: PropertyInvitation;
};

const INPUT_CLASS =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-gray-600 focus:ring-2 focus:ring-gray-200";

export default function PropertyInvitationsPanel({
  propertyId,
}: {
  propertyId: string;
}) {
  const [invitations, setInvitations] = useState<PropertyInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadInvitations = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/owner/properties/${propertyId}/invitations`,
        { cache: "no-store" },
      );
      const data = await readApiResponse<PropertyInvitation[]>(response);
      setInvitations(data);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Không thể tải danh sách lời mời",
      );
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    void loadInvitations();
  }, [loadInvitations]);

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);

    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    try {
      const response = await fetch(
        `/api/owner/properties/${propertyId}/invitations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            invitee_name: form.get("invitee_name"),
            email: form.get("email"),
            phone: form.get("phone"),
            expires_in_days: form.get("expires_in_days"),
          }),
        },
      );

      const result = await readApiResponse<InviteResult>(response);
      const invitation = result.invitation;

      if (!invitation) {
        throw new Error("API không trả về lời mời vừa tạo");
      }

      setInvitations((current) => [
        invitation,
        ...current.filter((item) => item.id !== invitation.id),
      ]);
      setNotice("Đã tạo lời mời manager. Sao chép link bên dưới để gửi cho người nhận.");
      formElement.reset();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Không thể tạo lời mời",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(invitationId: string) {
    setRevokingId(invitationId);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/owner/invitations/${invitationId}`, {
        method: "DELETE",
      });
      await readApiResponse(response);
      setInvitations((current) =>
        current.map((item) =>
          item.id === invitationId
            ? {
                ...item,
                status: "revoked",
                revoked_at: new Date().toISOString(),
              }
            : item,
        ),
      );
      setNotice("Đã thu hồi lời mời.");
    } catch (revokeError) {
      setError(
        revokeError instanceof Error
          ? revokeError.message
          : "Không thể thu hồi lời mời",
      );
    } finally {
      setRevokingId(null);
    }
  }

  async function copyInvitationLink(token: string) {
    const link = `${window.location.origin}/owner/invitations/accept?token=${token}`;

    try {
      await navigator.clipboard.writeText(link);
      setNotice("Đã sao chép link lời mời.");
      setError(null);
    } catch {
      setError("Trình duyệt không cho phép sao chép tự động. Hãy sao chép link thủ công.");
    }
  }

  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold">Quản lý manager</h2>
        <p className="mt-1 text-sm text-gray-500">
          Email không cần có tài khoản Kim Lân tại thời điểm gửi. Người nhận phải
          đăng nhập bằng đúng email hoặc số điện thoại được mời để chấp nhận.
        </p>
      </div>

      <form
        onSubmit={handleInvite}
        className="mt-5 grid gap-4 rounded-xl border bg-gray-50 p-4 md:grid-cols-2"
      >
        <Field label="Tên người được mời" htmlFor="invitee_name">
          <input
            id="invitee_name"
            name="invitee_name"
            className={INPUT_CLASS}
            maxLength={200}
          />
        </Field>

        <Field label="Email" htmlFor="email">
          <input
            id="email"
            name="email"
            type="email"
            className={INPUT_CLASS}
            maxLength={320}
            placeholder="manager@example.com"
          />
        </Field>

        <Field label="Số điện thoại" htmlFor="phone" hint="Bắt buộc email hoặc số điện thoại">
          <input
            id="phone"
            name="phone"
            type="tel"
            className={INPUT_CLASS}
            maxLength={40}
          />
        </Field>

        <Field label="Thời hạn" htmlFor="expires_in_days">
          <select
            id="expires_in_days"
            name="expires_in_days"
            className={INPUT_CLASS}
            defaultValue="14"
          >
            <option value="3">3 ngày</option>
            <option value="7">7 ngày</option>
            <option value="14">14 ngày</option>
            <option value="30">30 ngày</option>
          </select>
        </Field>

        <div className="md:col-span-2 flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Đang tạo..." : "Tạo lời mời manager"}
          </button>
        </div>
      </form>

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

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-medium">Lịch sử lời mời</h3>
          <button
            type="button"
            onClick={() => void loadInvitations()}
            disabled={loading}
            className="text-sm font-medium text-gray-600 hover:text-black disabled:opacity-50"
          >
            Làm mới
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Đang tải lời mời...</p>
        ) : invitations.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-gray-500">
            Chưa có lời mời manager.
          </p>
        ) : (
          <div className="space-y-3">
            {invitations.map((invitation) => {
              const link =
                typeof window === "undefined"
                  ? `/owner/invitations/accept?token=${invitation.token}`
                  : `${window.location.origin}/owner/invitations/accept?token=${invitation.token}`;

              return (
                <div key={invitation.id} className="rounded-xl border p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-medium">
                        {invitation.invitee_name ||
                          invitation.invited_email ||
                          invitation.invited_phone ||
                          "Manager"}
                      </p>
                      <p className="mt-1 text-sm text-gray-600">
                        {[invitation.invited_email, invitation.invited_phone]
                          .filter(Boolean)
                          .join(" • ")}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Hết hạn: {formatDateTime(invitation.expires_at)}
                      </p>
                    </div>

                    <StatusBadge status={invitation.status} />
                  </div>

                  {invitation.status === "pending" ? (
                    <div className="mt-4 space-y-2">
                      <input
                        readOnly
                        value={link}
                        aria-label="Link lời mời"
                        className={`${INPUT_CLASS} bg-gray-50 text-xs`}
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void copyInvitationLink(invitation.token)}
                          className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
                        >
                          Sao chép link
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRevoke(invitation.id)}
                          disabled={revokingId === invitation.id}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          {revokingId === invitation.id ? "Đang thu hồi..." : "Thu hồi"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-800">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}

function StatusBadge({ status }: { status: InvitationStatus }) {
  const styles: Record<InvitationStatus, string> = {
    pending: "bg-amber-100 text-amber-800",
    accepted: "bg-green-100 text-green-800",
    revoked: "bg-red-100 text-red-800",
    expired: "bg-gray-100 text-gray-700",
  };
  const labels: Record<InvitationStatus, string> = {
    pending: "Đang chờ",
    accepted: "Đã nhận",
    revoked: "Đã thu hồi",
    expired: "Hết hạn",
  };

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleString("vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
      });
}
