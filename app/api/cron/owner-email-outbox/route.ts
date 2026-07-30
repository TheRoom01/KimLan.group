import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET ?? "";
  const received = request.headers.get("x-cron-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected && process.env.NODE_ENV === "development") return true;
  return Boolean(expected && received === expected);
}

async function run(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "Missing RESEND_API_KEY" }, { status: 503 });

  const supabase = createSupabaseAdminClient();
  const { data: rows, error } = await supabase.from("owner_email_outbox").select("*").eq("status", "pending").order("created_at").limit(10);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://canhodichvu.pro";
  let processed = 0;
  let sent = 0;
  for (const row of rows ?? []) {
    const nextAttempts = Number(row.attempts || 0) + 1;
    const { data: claimed, error: claimError } = await supabase
      .from("owner_email_outbox")
      .update({ status: "sending" })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (claimError || !claimed) continue;
    processed += 1;
    try {
      const address = String(row.payload?.address || "tòa nhà");
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.OWNER_EMAIL_FROM || "KimLan Group <noreply@canhodichvu.pro>",
          to: [row.recipient_email],
          subject: row.subject,
          html: `<p>Có yêu cầu xác minh quyền sở hữu cho <strong>${escapeHtml(address)}</strong>.</p><p>Vui lòng đăng nhập Owner Portal để kiểm tra và chấp nhận hoặc từ chối yêu cầu.</p><p><a href="${siteUrl}/owner/properties">Mở trang quản lý tòa nhà</a></p>`,
        }),
      });
      if (!response.ok) throw new Error(`Resend ${response.status}: ${(await response.text()).slice(0, 500)}`);
      const { error: sentError } = await supabase.from("owner_email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), attempts: nextAttempts, last_error: null }).eq("id", row.id);
      if (sentError) throw sentError;
      sent += 1;
    } catch (sendError) {
      await supabase.from("owner_email_outbox").update({ status: "failed", attempts: nextAttempts, last_error: sendError instanceof Error ? sendError.message : String(sendError) }).eq("id", row.id);
    }
  }
  return NextResponse.json({ ok: true, processed, sent });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);
}

export const GET = run;
export const POST = run;
