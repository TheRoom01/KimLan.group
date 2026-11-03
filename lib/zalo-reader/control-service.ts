import { randomUUID } from "node:crypto";

export async function readReaderControl(db: any) {
  const result = await db.from("zalo_reader_control").select("*").eq("id", "primary").single();
  if (result.error) throw result.error;
  return result.data;
}

export async function requestReaderControl(db: any, enabled: boolean, actorId: string) {
  const result = await db.from("zalo_reader_control").update({
    desired_enabled: enabled, request_id: randomUUID(), requested_at: new Date().toISOString(),
    requested_by: actorId, last_error: null,
  }).eq("id", "primary").select("*").single();
  if (result.error) throw result.error;
  return result.data;
}

export async function requestOpenZalo(db: any, actorId: string) {
  const result = await db.from("zalo_reader_control").update({
    open_request_id: randomUUID(), open_requested_at: new Date().toISOString(),
    open_requested_by: actorId, open_error: null,
  }).eq("id", "primary").select("*").single();
  if (result.error) throw result.error;
  return result.data;
}

export async function reportReaderControl(db: any, body: any) {
  if (typeof body.actualEnabled !== "boolean" || (body.requestId != null && !/^[a-f0-9-]{36}$/i.test(body.requestId)) ||
    ![undefined, null, "SCHEDULER_CONTROL_FAILED"].includes(body.error) ||
    (body.openRequestId != null && !/^[a-f0-9-]{36}$/i.test(body.openRequestId)) ||
    ![undefined, null, "ZALO_OPEN_FAILED"].includes(body.openError)) throw new Error("INVALID_CONTROL_REPORT");
  const heartbeat = await db.from("zalo_reader_control").update({ actual_enabled: body.actualEnabled,
    heartbeat_at: new Date().toISOString() }).eq("id", "primary");
  if (heartbeat.error) throw heartbeat.error;
  if (body.openRequestId) {
    const result = await db.from("zalo_reader_control").update(body.openError
      ? { open_error: body.openError }
      : { open_applied_request_id: body.openRequestId, open_error: null })
      .eq("id", "primary").eq("open_request_id", body.openRequestId);
    if (result.error) throw result.error;
  }
  if (body.requestId) {
    const result = await db.from("zalo_reader_control").update(body.error
      ? { last_error: body.error }
      : { applied_request_id: body.requestId, last_error: null })
      .eq("id", "primary").eq("request_id", body.requestId);
    if (result.error) throw result.error;
  }
}
