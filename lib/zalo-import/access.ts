// The Supabase Auth ID of the verified account designated to review Zalo imports.
const ZALO_IMPORT_REVIEWER_ID = "2e803047-4878-49a5-b1bc-e5d86e7f96bc";

export function canAccessZaloImports(user: { id: string } | null | undefined): boolean {
  return user?.id === ZALO_IMPORT_REVIEWER_ID;
}
