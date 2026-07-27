"use client";

import {
  Building2,
  Camera,
  ChevronRight,
  Eye,
  ImageIcon,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
  Users,
  X,
} from "lucide-react";

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { readApiResponse } from "@/lib/api/client";

import OwnerAvatarCropper from "@/components/owner/OwnerAvatarCropper";

type AccountProperty = {
  id: string;
  name: string;
  role: string;
  status?: string;
};

type CurrentAccount = {
  user_id: string;
  full_name?: string | null;
  login_email?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  avatar_url?: string | null;
  note?: string | null;
};

type AccountMember = {
  user_id: string;
  display_name?: string | null;
  avatar_url?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  note?: string | null;
  roles?: string[];
  properties?: AccountProperty[];
  can_edit?: boolean;
};

type AccountPanelData = {
  current_user: CurrentAccount;
  workspace_role: string;
  can_edit_members: boolean;
  properties: AccountProperty[];
  members: AccountMember[];
};

type ProfileDraft = {
  full_name: string;
  contact_email: string;
  contact_phone: string;
  note: string;
};

type MemberDraft = {
  display_name: string;
  contact_email: string;
  contact_phone: string;
  note: string;
};

type AvatarPresignResult = {
  key: string;
  publicUrl: string;
  uploadUrl: string;
  requiredHeaders?: Record<string, string>;
};

const INPUT_CLASS =
  "h-11 w-full rounded-xl border border-[#aa825d]/30 bg-[#fffdf8] px-3.5 text-sm text-[#4d3422] outline-none transition placeholder:text-[#a58a73] focus:border-[#744722] focus:ring-4 focus:ring-[#744722]/10 disabled:opacity-60";

const TEXTAREA_CLASS =
  "min-h-20 w-full resize-y rounded-xl border border-[#aa825d]/30 bg-[#fffdf8] px-3.5 py-3 text-sm text-[#4d3422] outline-none transition placeholder:text-[#a58a73] focus:border-[#744722] focus:ring-4 focus:ring-[#744722]/10 disabled:opacity-60";

  const MAX_AVATAR_SOURCE_BYTES =
  10 * 1024 * 1024;

const ALLOWED_AVATAR_TYPES =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function roleLabel(role?: string | null) {
  switch (role) {
    case "owner":
      return "Chủ nhà";
    case "manager":
      return "Quản lý";
    case "viewer":
      return "Chỉ xem";
    default:
      return "Thành viên";
  }
}

function getInitials(value?: string | null) {
  const words = String(value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "TK";

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

function createProfileDraft(
  account?: CurrentAccount | null,
): ProfileDraft {
  return {
    full_name: textValue(
      account?.full_name,
    ),

    contact_email: textValue(
      account?.contact_email,
    ),

    contact_phone: textValue(
      account?.contact_phone,
    ),

    note: textValue(
      account?.note,
    ),
  };
}

function createMemberDraft(member: AccountMember): MemberDraft {
  return {
    display_name: textValue(member.display_name),
    contact_email: textValue(member.contact_email),
    contact_phone: textValue(member.contact_phone),
    note: textValue(member.note),
  };
}

export default function OwnerAccountPanel() {
  const [open, setOpen] = useState(false);

  const [data, setData] = useState<AccountPanelData | null>(
    null,
  );

  const avatarInputRef =
  useRef<HTMLInputElement | null>(null);

const [avatarMenuOpen, setAvatarMenuOpen] =
  useState(false);

const [
  avatarViewerOpen,
  setAvatarViewerOpen,
] = useState(false);

const [
  avatarDeleteConfirmOpen,
  setAvatarDeleteConfirmOpen,
] = useState(false);

const [
  avatarSourceUrl,
  setAvatarSourceUrl,
] = useState<string | null>(null);

const [
  avatarSaving,
  setAvatarSaving,
] = useState(false);

  const [profileDraft, setProfileDraft] =
    useState<ProfileDraft>(createProfileDraft());

  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);

  const [editingMemberId, setEditingMemberId] =
    useState<string | null>(null);

  const [memberDraft, setMemberDraft] =
    useState<MemberDraft | null>(null);

  const [savingMemberId, setSavingMemberId] =
    useState<string | null>(null);

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const loadPanel = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/owner/account", {
        method: "GET",
        cache: "no-store",
      });

      const result =
        await readApiResponse<AccountPanelData>(response);

      setData(result);
      setProfileDraft(
        createProfileDraft(result.current_user),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Không thể tải thông tin tài khoản",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Tải ngay khi header được mount để tên tài khoản trên nút
   * không còn bị hard-code.
   */
  useEffect(() => {
    void loadPanel();
  }, [loadPanel]);

  useEffect(() => {
  return () => {
    if (avatarSourceUrl) {
      URL.revokeObjectURL(
        avatarSourceUrl,
      );
    }
  };
}, [avatarSourceUrl]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const accountName =
    data?.current_user?.full_name ||
    data?.current_user?.contact_email ||
    data?.current_user?.login_email ||
    "Tài khoản";

  const accountRole = roleLabel(data?.workspace_role);

  const memberCount = data?.members?.length ?? 0;

  const accountInitials = useMemo(
    () => getInitials(accountName),
    [accountName],
  );

  async function saveProfile(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setSavingProfile(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/owner/account", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(profileDraft),
      });

      await readApiResponse(response);
      await loadPanel();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Không thể lưu hồ sơ",
      );
    } finally {
      setSavingProfile(false);
    }
  }

  function beginEditMember(member: AccountMember) {
    setEditingMemberId(member.user_id);
    setMemberDraft(createMemberDraft(member));
    setErrorMessage(null);
  }

  function cancelEditMember() {
    setEditingMemberId(null);
    setMemberDraft(null);
  }

  

  async function saveMember(
    event: FormEvent<HTMLFormElement>,
    memberUserId: string,
  ) {
    event.preventDefault();

    if (!memberDraft) return;

    setSavingMemberId(memberUserId);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/owner/members/${memberUserId}/contact`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(memberDraft),
        },
      );

      await readApiResponse(response);

      setEditingMemberId(null);
      setMemberDraft(null);

      await loadPanel();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Không thể cập nhật thành viên",
      );
    } finally {
      setSavingMemberId(null);
    }
  }

  function openAvatarFilePicker() {
  setAvatarMenuOpen(false);

  avatarInputRef.current?.click();
}

function handleAvatarFileChange(
  event: ChangeEvent<HTMLInputElement>,
) {
  const file =
    event.target.files?.[0];

  event.target.value = "";

  if (!file) {
    return;
  }

  setErrorMessage(null);

  if (
    !ALLOWED_AVATAR_TYPES.has(file.type)
  ) {
    setErrorMessage(
      "Ảnh đại diện chỉ hỗ trợ JPG, PNG hoặc WebP",
    );

    return;
  }

  if (
    file.size >
    MAX_AVATAR_SOURCE_BYTES
  ) {
    setErrorMessage(
      "Ảnh đại diện không được vượt quá 10 MB",
    );

    return;
  }

  setAvatarSourceUrl((current) => {
    if (current) {
      URL.revokeObjectURL(current);
    }

    return URL.createObjectURL(file);
  });
}

async function saveCroppedAvatar(
  blob: Blob,
) {
  setAvatarSaving(true);
  setErrorMessage(null);

  try {
    const avatarUrl =
      await uploadAvatarBlob(blob);

    const saveResponse = await fetch(
      "/api/owner/account/avatar",
      {
        method: "PATCH",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          avatar_url: avatarUrl,
        }),
      },
    );

    await readApiResponse(saveResponse);

    setAvatarSourceUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }

      return null;
    });

    await loadPanel();
  } catch (error) {
    setErrorMessage(
      error instanceof Error
        ? error.message
        : "Không thể cập nhật ảnh đại diện",
    );
  } finally {
    setAvatarSaving(false);
  }
}

async function deleteAvatar() {
  setAvatarSaving(true);
  setErrorMessage(null);

  try {
    const response = await fetch(
      "/api/owner/account/avatar",
      {
        method: "DELETE",
      },
    );

    await readApiResponse(response);

    setAvatarDeleteConfirmOpen(false);
    setAvatarMenuOpen(false);

    await loadPanel();
  } catch (error) {
    setErrorMessage(
      error instanceof Error
        ? error.message
        : "Không thể xóa ảnh đại diện",
    );
  } finally {
    setAvatarSaving(false);
  }
}

  return (
    <>
    <input
  ref={avatarInputRef}
  type="file"
  accept="image/jpeg,image/png,image/webp"
  onChange={handleAvatarFileChange}
  className="hidden"
/>

      {/* Nút desktop */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden min-w-0 items-center gap-2 rounded-xl border border-[#f3d9b4]/20 bg-white/5 px-3 py-2 text-left transition hover:bg-white/10 xl:flex"
      >
        <AccountAvatar
          name={accountName}
          avatarUrl={data?.current_user?.avatar_url}
          initials={accountInitials}
          size="small"
        />

        <div className="min-w-0 max-w-[160px] leading-tight">
          <p className="truncate text-sm font-semibold text-[#fff6e8]">
            {accountName}
          </p>

          <p className="truncate text-[11px] text-[#e8cfad]">
            {accountRole} · Owner Portal
          </p>
        </div>

        <ChevronRight
          size={15}
          className="shrink-0 text-[#e8cfad]"
        />
      </button>

      {/* Nút mobile và màn hình desktop hẹp */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Mở thông tin tài khoản"
        title={accountName}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#f3d9b4]/20 bg-white/5 transition hover:bg-white/10 xl:hidden"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[#f2d9b6] text-[10px] font-bold text-[#633b20]">
          {accountInitials}
        </span>
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Đóng bảng tài khoản"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[100] cursor-default bg-black/35 backdrop-blur-[2px]"
          />

          <aside className="fixed inset-y-0 right-0 z-[110] flex w-full flex-col overflow-hidden border-l border-[#8b5a32]/25 bg-[#f8ecda] shadow-[-30px_0_80px_rgba(69,40,19,0.28)] sm:max-w-[460px]">
            <header className="shrink-0 bg-gradient-to-br from-[#79502d] to-[#593219] px-5 pb-5 pt-5 text-[#fff8eb]">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                        setAvatarMenuOpen(true)
                    }
                    aria-label="Thay đổi ảnh đại diện"
                    className="group relative shrink-0 rounded-full outline-none focus-visible:ring-4 focus-visible:ring-white/25"
                    >
                    <AccountAvatar
                        name={accountName}
                        avatarUrl={
                        data?.current_user?.avatar_url
                        }
                        initials={accountInitials}
                        size="large"
                    />

                    <span className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border-2 border-[#79502d] bg-[#f2d9b6] text-[#633b20] shadow-md transition group-hover:bg-[#ffe6c3]">
                        <Camera size={15} />
                    </span>
                  </button>

                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold">
                      {accountName}
                    </p>

                    <p className="mt-0.5 text-xs text-[#e9cba7]">
                      {accountRole} · {memberCount} thành viên
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Đóng"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/5 transition hover:bg-white/10"
                >
                  <X size={19} />
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              {loading ? (
                <div className="flex min-h-60 items-center justify-center">
                  <Loader2
                    size={26}
                    className="animate-spin text-[#744722]"
                  />
                </div>
              ) : null}

              {!loading && errorMessage ? (
                <div
                  role="alert"
                  className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700"
                >
                  {errorMessage}

                  <button
                    type="button"
                    onClick={() => void loadPanel()}
                    className="ml-2 font-semibold underline"
                  >
                    Tải lại
                  </button>
                </div>
              ) : null}

              {!loading && data ? (
                <div className="space-y-5">
                  <section className="rounded-2xl border border-[#a9825f]/25 bg-[#fff9ef] p-4 shadow-sm">
                    <div className="flex items-center gap-2">
                      <UserRound
                        size={18}
                        className="text-[#744722]"
                      />

                      <h2 className="font-bold text-[#4c301d]">
                        Hồ sơ của tôi
                      </h2>
                    </div>

                    <p className="mt-1 text-xs leading-5 text-[#80634a]">
                      Email và số điện thoại bên dưới chỉ dùng làm
                      thông tin liên hệ, không thay đổi tài khoản
                      đăng nhập.
                    </p>

                    <form
                      onSubmit={saveProfile}
                      className="mt-4 space-y-4"
                    >
                      <Field label="Họ và tên">
                        <input
                          value={profileDraft.full_name}
                          onChange={(event) =>
                            setProfileDraft((current) => ({
                              ...current,
                              full_name: event.target.value,
                            }))
                          }
                          maxLength={200}
                          disabled={savingProfile}
                          className={INPUT_CLASS}
                          placeholder="Nhập họ và tên"
                        />
                      </Field>

                      <Field
                        label="Email liên hệ"
                        hint={
                            data.current_user.login_email
                            ? `Email đăng nhập: ${data.current_user.login_email}`
                            : undefined
                        }
                        >
                        <div className="flex h-11 overflow-hidden rounded-xl border border-[#aa825d]/30 bg-[#fffdf8] transition focus-within:border-[#744722] focus-within:ring-4 focus-within:ring-[#744722]/10">
                            <span className="grid w-11 shrink-0 place-items-center border-r border-[#aa825d]/20 bg-[#f5e5cf] text-[#8a6547]">
                            <Mail size={17} />
                            </span>

                            <input
                            type="email"
                            value={profileDraft.contact_email}
                            onChange={(event) =>
                                setProfileDraft((current) => ({
                                ...current,
                                contact_email: event.target.value,
                                }))
                            }
                            maxLength={320}
                            disabled={savingProfile}
                            className="min-w-0 flex-1 border-0 bg-transparent px-3.5 text-sm text-[#4d3422] outline-none placeholder:text-[#a58a73] disabled:opacity-60"
                            placeholder="Email liên hệ"
                            />
                        </div>
                      </Field>

                      <Field label="Số điện thoại liên hệ">
                        <div className="flex h-11 overflow-hidden rounded-xl border border-[#aa825d]/30 bg-[#fffdf8] transition focus-within:border-[#744722] focus-within:ring-4 focus-within:ring-[#744722]/10">
                            <span className="grid w-11 shrink-0 place-items-center border-r border-[#aa825d]/20 bg-[#f5e5cf] text-[#8a6547]">
                            <Phone size={17} />
                            </span>

                            <input
                            type="tel"
                            inputMode="tel"
                            value={profileDraft.contact_phone}
                            onChange={(event) =>
                                setProfileDraft((current) => ({
                                ...current,
                                contact_phone: event.target.value,
                                }))
                            }
                            maxLength={50}
                            disabled={savingProfile}
                            className="min-w-0 flex-1 border-0 bg-transparent px-3.5 text-sm text-[#4d3422] outline-none placeholder:text-[#a58a73] disabled:opacity-60"
                            placeholder="090..."
                            />
                        </div>
                      </Field>

                     
                      <Field label="Ghi chú">
                        <textarea
                          value={profileDraft.note}
                          onChange={(event) =>
                            setProfileDraft((current) => ({
                              ...current,
                              note: event.target.value,
                            }))
                          }
                          maxLength={2000}
                          disabled={savingProfile}
                          className={TEXTAREA_CLASS}
                          placeholder="Thông tin nội bộ..."
                        />
                      </Field>

                      <button
                        type="submit"
                        disabled={savingProfile}
                        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#744722] px-4 text-sm font-bold text-[#fff7e9] transition hover:bg-[#623817] disabled:opacity-50"
                      >
                        {savingProfile ? (
                          <>
                            <Loader2
                              size={17}
                              className="animate-spin"
                            />
                            Đang lưu...
                          </>
                        ) : (
                          <>
                            <Save size={17} />
                            Lưu hồ sơ
                          </>
                        )}
                      </button>
                    </form>
                  </section>

                  <section className="rounded-2xl border border-[#a9825f]/25 bg-[#fff9ef] p-4 shadow-sm">
                    <div className="flex items-center gap-2">
                      <Building2
                        size={18}
                        className="text-[#744722]"
                      />

                      <h2 className="font-bold text-[#4c301d]">
                        Tòa nhà đang tham gia
                      </h2>
                    </div>

                    {data.properties.length === 0 ? (
                      <p className="mt-4 text-sm text-[#80634a]">
                        Tài khoản chưa tham gia tòa nhà nào.
                      </p>
                    ) : (
                      <div className="mt-4 space-y-2">
                        {data.properties.map((property) => (
                          <div
                            key={property.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-[#aa825d]/20 bg-[#f7ead7] px-3 py-3"
                          >
                            <p className="min-w-0 truncate text-sm font-semibold text-[#503521]">
                              {property.name}
                            </p>

                            <RoleBadge role={property.role} />
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="rounded-2xl border border-[#a9825f]/25 bg-[#fff9ef] p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Users
                            size={18}
                            className="text-[#744722]"
                          />

                          <h2 className="font-bold text-[#4c301d]">
                            Thành viên quản lý chung
                          </h2>
                        </div>

                        <p className="mt-1 text-xs leading-5 text-[#80634a]">
                          {data.can_edit_members
                            ? "Bạn có thể chỉnh sửa thông tin liên hệ của thành viên thuộc tòa nhà mình sở hữu."
                            : "Chỉ tài khoản Chủ nhà mới được chỉnh sửa thông tin thành viên."}
                        </p>
                      </div>

                      {data.can_edit_members ? (
                        <ShieldCheck
                          size={20}
                          className="shrink-0 text-[#744722]"
                        />
                      ) : null}
                    </div>

                    {data.members.length === 0 ? (
                      <div className="mt-4 rounded-xl border border-dashed border-[#aa825d]/30 bg-[#f7ead7] px-4 py-8 text-center text-sm text-[#80634a]">
                        Chưa có thành viên quản lý chung.
                      </div>
                    ) : (
                      <div className="mt-4 space-y-3">
                        {data.members.map((member) => {
                          const editing =
                            editingMemberId === member.user_id;

                          const saving =
                            savingMemberId === member.user_id;

                          return (
                            <article
                              key={member.user_id}
                              className="rounded-2xl border border-[#aa825d]/20 bg-[#f7ead7] p-3.5"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-3">
                                  <AccountAvatar
                                    name={
                                        member.display_name ||
                                        "Thành viên"
                                    }
                                    avatarUrl={member.avatar_url}
                                    initials={getInitials(
                                        member.display_name,
                                    )}
                                    size="member"
                                  />

                                  <div className="min-w-0">
                                    <p className="truncate font-bold text-[#4d301d]">
                                      {member.display_name ||
                                        "Thành viên"}
                                    </p>

                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {(member.roles ?? []).map(
                                        (role) => (
                                          <RoleBadge
                                            key={role}
                                            role={role}
                                          />
                                        ),
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {member.can_edit && !editing ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      beginEditMember(member)
                                    }
                                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#9d744f]/25 bg-[#fff9ef] text-[#744722] transition hover:bg-[#f0ddc4]"
                                    aria-label="Chỉnh sửa thành viên"
                                  >
                                    <Pencil size={16} />
                                  </button>
                                ) : null}
                              </div>

                              {editing && memberDraft ? (
                                <form
                                  onSubmit={(event) =>
                                    void saveMember(
                                      event,
                                      member.user_id,
                                    )
                                  }
                                  className="mt-4 space-y-3 border-t border-[#aa825d]/20 pt-4"
                                >
                                  <Field label="Tên hiển thị">
                                    <input
                                      value={
                                        memberDraft.display_name
                                      }
                                      onChange={(event) =>
                                        setMemberDraft(
                                          (current) =>
                                            current
                                              ? {
                                                  ...current,
                                                  display_name:
                                                    event.target
                                                      .value,
                                                }
                                              : current,
                                        )
                                      }
                                      maxLength={200}
                                      disabled={saving}
                                      className={INPUT_CLASS}
                                    />
                                  </Field>

                                  <Field label="Email liên hệ">
                                    <input
                                      type="email"
                                      value={
                                        memberDraft.contact_email
                                      }
                                      onChange={(event) =>
                                        setMemberDraft(
                                          (current) =>
                                            current
                                              ? {
                                                  ...current,
                                                  contact_email:
                                                    event.target
                                                      .value,
                                                }
                                              : current,
                                        )
                                      }
                                      maxLength={320}
                                      disabled={saving}
                                      className={INPUT_CLASS}
                                    />
                                  </Field>

                                  <Field label="Số điện thoại">
                                    <input
                                      value={
                                        memberDraft.contact_phone
                                      }
                                      onChange={(event) =>
                                        setMemberDraft(
                                          (current) =>
                                            current
                                              ? {
                                                  ...current,
                                                  contact_phone:
                                                    event.target
                                                      .value,
                                                }
                                              : current,
                                        )
                                      }
                                      maxLength={50}
                                      disabled={saving}
                                      className={INPUT_CLASS}
                                    />
                                  </Field>

                                  <Field label="Ghi chú">
                                    <textarea
                                      value={memberDraft.note}
                                      onChange={(event) =>
                                        setMemberDraft(
                                          (current) =>
                                            current
                                              ? {
                                                  ...current,
                                                  note: event.target
                                                    .value,
                                                }
                                              : current,
                                        )
                                      }
                                      maxLength={2000}
                                      disabled={saving}
                                      className={TEXTAREA_CLASS}
                                    />
                                  </Field>

                                  <div className="grid grid-cols-2 gap-2">
                                    <button
                                      type="button"
                                      onClick={cancelEditMember}
                                      disabled={saving}
                                      className="h-10 rounded-xl border border-[#9d744f]/30 bg-[#fff9ef] text-sm font-semibold text-[#684324] disabled:opacity-50"
                                    >
                                      Hủy
                                    </button>

                                    <button
                                      type="submit"
                                      disabled={saving}
                                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#744722] text-sm font-bold text-[#fff7e9] disabled:opacity-50"
                                    >
                                      {saving ? (
                                        <Loader2
                                          size={16}
                                          className="animate-spin"
                                        />
                                      ) : (
                                        <Save size={16} />
                                      )}

                                      Lưu
                                    </button>
                                  </div>
                                </form>
                              ) : (
                                <>
                                  <div className="mt-3 space-y-1.5 text-xs text-[#765941]">
                                    <p className="flex items-center gap-2">
                                      <Mail
                                        size={14}
                                        className="shrink-0"
                                      />
                                      <span className="truncate">
                                        {member.contact_email ||
                                          "Chưa có email liên hệ"}
                                      </span>
                                    </p>

                                    <p className="flex items-center gap-2">
                                      <Phone
                                        size={14}
                                        className="shrink-0"
                                      />
                                      <span className="truncate">
                                        {member.contact_phone ||
                                          "Chưa có số điện thoại"}
                                      </span>
                                    </p>
                                  </div>

                                  {(member.properties ?? []).length >
                                  0 ? (
                                    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[#aa825d]/20 pt-3">
                                      {member.properties?.map(
                                        (property) => (
                                          <span
                                            key={`${member.user_id}-${property.id}`}
                                            className="rounded-lg bg-[#fff9ef] px-2 py-1 text-[10px] font-semibold text-[#684324]"
                                          >
                                            {property.name}
                                          </span>
                                        ),
                                      )}
                                    </div>
                                  ) : null}
                                </>
                              )}
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </div>
              ) : null}
            </div>
          </aside>
        </>
      ) : null}

      {avatarMenuOpen ? (
  <div className="fixed inset-0 z-[140]">
    <button
      type="button"
      aria-label="Đóng menu ảnh đại diện"
      onClick={() =>
        setAvatarMenuOpen(false)
      }
      className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
    />

    <section className="absolute inset-x-3 bottom-3 overflow-hidden rounded-[22px] border border-[#a9825f]/25 bg-[#fff9ef] shadow-[0_25px_80px_rgba(52,30,14,0.35)] sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:w-[360px] sm:-translate-x-1/2 sm:-translate-y-1/2">
      <header className="border-b border-[#a9825f]/20 px-5 py-4">
        <p className="font-bold text-[#432918]">
          Ảnh đại diện
        </p>

        <p className="mt-1 text-xs text-[#82654d]">
          Chọn thao tác với ảnh của bạn
        </p>
      </header>

      <div className="p-2">
        <button
          type="button"
          disabled={
            !data?.current_user
              ?.avatar_url
          }
          onClick={() => {
            setAvatarMenuOpen(false);
            setAvatarViewerOpen(true);
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-[#503521] transition hover:bg-[#f2e1cb] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#ead3b3] text-[#684324]">
            <Eye size={18} />
          </span>

          Xem ảnh đại diện
        </button>

        <button
          type="button"
          onClick={openAvatarFilePicker}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-[#503521] transition hover:bg-[#f2e1cb]"
        >
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#ead3b3] text-[#684324]">
            <Upload size={18} />
          </span>

          Chọn ảnh mới
        </button>

        <button
          type="button"
          disabled={
            !data?.current_user
              ?.avatar_url
          }
          onClick={() => {
            setAvatarMenuOpen(false);

            setAvatarDeleteConfirmOpen(
              true,
            );
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-red-100 text-red-700">
            <Trash2 size={18} />
          </span>

          Xóa ảnh đại diện
        </button>
      </div>

      <div className="border-t border-[#a9825f]/20 p-3">
        <button
          type="button"
          onClick={() =>
            setAvatarMenuOpen(false)
          }
          className="h-11 w-full rounded-xl border border-[#9d744f]/30 bg-[#fff9ef] text-sm font-semibold text-[#684324] transition hover:bg-[#f2e1cb]"
        >
          Hủy
        </button>
      </div>
    </section>
  </div>
) : null}

{avatarViewerOpen &&
data?.current_user?.avatar_url ? (
  <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/85 px-4 py-6">
    <button
      type="button"
      aria-label="Đóng ảnh đại diện"
      onClick={() =>
        setAvatarViewerOpen(false)
      }
      className="absolute inset-0"
    />

    <section className="relative z-10">
      <img
        src={
          data.current_user
            .avatar_url
        }
        alt={accountName}
        className="max-h-[78vh] max-w-[90vw] rounded-2xl object-contain shadow-[0_30px_100px_rgba(0,0,0,0.6)]"
      />

      <button
        type="button"
        onClick={() =>
          setAvatarViewerOpen(false)
        }
        className="absolute -right-3 -top-3 grid h-11 w-11 place-items-center rounded-full bg-white text-[#432918] shadow-lg"
        aria-label="Đóng"
      >
        <X size={20} />
      </button>
    </section>
  </div>
) : null}

    {avatarDeleteConfirmOpen ? (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm">
        <section className="w-full max-w-sm rounded-[22px] border border-[#a9825f]/25 bg-[#fff9ef] p-5 shadow-[0_30px_100px_rgba(50,28,12,0.35)]">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-red-100 text-red-700">
            <Trash2 size={21} />
        </span>

        <h2 className="mt-4 text-lg font-bold text-[#432918]">
            Xóa ảnh đại diện?
        </h2>

        <p className="mt-2 text-sm leading-6 text-[#80634a]">
            Hệ thống sẽ xóa ảnh khỏi hồ sơ và
            dọn file tương ứng trên R2.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
            <button
            type="button"
            disabled={avatarSaving}
            onClick={() =>
                setAvatarDeleteConfirmOpen(
                false,
                )
            }
            className="h-11 rounded-xl border border-[#9d744f]/30 text-sm font-semibold text-[#684324] disabled:opacity-50"
            >
            Hủy
            </button>

            <button
            type="button"
            disabled={avatarSaving}
            onClick={() =>
                void deleteAvatar()
            }
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-red-700 text-sm font-bold text-white disabled:opacity-50"
            >
            {avatarSaving ? (
                <Loader2
                size={17}
                className="animate-spin"
                />
            ) : (
                <Trash2 size={17} />
            )}

            Xóa ảnh
            </button>
        </div>
        </section>
    </div>
    ) : null}

    {avatarSourceUrl ? (
    <OwnerAvatarCropper
        imageUrl={avatarSourceUrl}
        saving={avatarSaving}
        onCancel={() => {
        setAvatarSourceUrl(
            (current) => {
            if (current) {
                URL.revokeObjectURL(
                current,
                );
            }

            return null;
            },
        );
        }}
        onConfirm={saveCroppedAvatar}
    />
    ) : null}

    </>
  );
}

function AccountAvatar({
  name,
  avatarUrl,
  initials,
  size,
}: {
  name: string;
  avatarUrl?: string | null;
  initials: string;
  size: "small" | "large" | "member";
}) {
  const sizeClass =
  size === "large"
    ? "h-12 w-12"
    : size === "member"
      ? "h-10 w-10"
      : "h-8 w-8";

      const fallbackClass =
  size === "member"
    ? "bg-[#744722] text-[#fff7e9]"
    : "bg-[#f2d9b6] text-[#633b20]";

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${sizeClass} shrink-0 rounded-full border border-white/20 object-cover`}
      />
    );
  }

  return (
    <span
        className={`grid ${sizeClass} ${fallbackClass} shrink-0 place-items-center rounded-full text-xs font-bold`}
    >
        {initials}
    </span>
   );
}

function RoleBadge({ role }: { role?: string | null }) {
  return (
    <span className="rounded-full bg-[#ead3b3] px-2 py-0.5 text-[10px] font-bold text-[#684324]">
      {roleLabel(role)}
    </span>
  );
}

async function uploadAvatarBlob(
  blob: Blob,
) {
  const presignResponse = await fetch(
    "/api/owner/account/avatar/presign",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        file_name: "avatar.webp",
        content_type: "image/webp",
        size: blob.size,
      }),
    },
  );

  const rawPayload =
    await presignResponse
      .json()
      .catch(() => null);

  const payload =
    rawPayload &&
    typeof rawPayload === "object" &&
    "ok" in rawPayload &&
    rawPayload.ok === true &&
    "data" in rawPayload
      ? rawPayload.data
      : rawPayload;

  const presign =
    payload as
      | AvatarPresignResult
      | null;

  if (
    !presignResponse.ok ||
    !presign?.uploadUrl ||
    !presign?.publicUrl ||
    !presign?.key
  ) {
    const message =
      rawPayload &&
      typeof rawPayload === "object" &&
      "error" in rawPayload
        ? String(
            (
              rawPayload as {
                error?: unknown;
              }
            ).error ?? "",
          )
        : "";

    throw new Error(
      message ||
        "Không thể tạo URL upload ảnh đại diện",
    );
  }

  const uploadResponse = await fetch(
    presign.uploadUrl,
    {
      method: "PUT",
      headers:
        presign.requiredHeaders ?? {
          "Content-Type":
            "image/webp",
        },
      body: blob,
    },
  );

  if (!uploadResponse.ok) {
    const detail =
      await uploadResponse
        .text()
        .catch(() => "");

    throw new Error(
      `Upload ảnh đại diện lên R2 thất bại (${uploadResponse.status})${
        detail
          ? `: ${detail.slice(0, 150)}`
          : ""
      }`,
    );
  }

  return presign.publicUrl;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-[#5a3b25]">
        {label}
      </span>

      {children}

      {hint ? (
        <span className="mt-1.5 block break-words text-[10px] leading-4 text-[#94765d]">
          {hint}
        </span>
      ) : null}
    </label>
  );
}