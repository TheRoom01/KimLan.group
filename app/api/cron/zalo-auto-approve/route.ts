// Keep the retired URL for old callers. A request must never touch the database.
function autoApproveDisabled() {
  return Response.json({ ok: false, code: "ZALO_AUTO_APPROVE_DISABLED" }, { status: 410 });
}

export const GET = autoApproveDisabled;
export const POST = autoApproveDisabled;
