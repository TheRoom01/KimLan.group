import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hashSalesPortalToken, isSalesPortalToken } from "./token";

export async function getCollectionTokens(token: unknown): Promise<string[]> {
  if (!isSalesPortalToken(token)) return [];
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("sales_portal_collections")
    .select("link_ids,expires_at,revoked_at").eq("token_hash", hashSalesPortalToken(token)).maybeSingle();
  if (error) throw error;
  if (!data || data.revoked_at || (data.expires_at && Date.parse(data.expires_at) <= Date.now())) return [];
  const { data: links, error: linksError } = await db.from("sales_portal_links").select("id,public_token")
    .in("id", data.link_ids);
  if (linksError) throw linksError;
  const byId = new Map((links ?? []).map((link) => [link.id, link.public_token]));
  // getSalesPortalData revalidates each building link, including expiry and revocation.
  return (data.link_ids as string[]).map((id) => byId.get(id)).filter(isSalesPortalToken);
}
