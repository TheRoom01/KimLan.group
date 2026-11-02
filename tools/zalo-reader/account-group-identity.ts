/** A Zalo conversation ID is account-specific. Keep the existing server source
 * namespace stable, but require fresh DOM-to-IndexedDB proof for a local alias. */
export function canonicalAccountGroup(input: {
  canonicalId: string; accountId: string; observedId: string;
  exactResultCount: number; matchedDomIds: number; trusted: boolean;
}) {
  if (![input.canonicalId, input.accountId, input.observedId].every(id => /^g\d{10,30}$/.test(id)) || !input.trusted || input.accountId !== input.observedId || input.exactResultCount !== 1 || input.matchedDomIds < 1) {
    throw new Error("ACCOUNT_GROUP_ID_UNVERIFIED");
  }
  return input.canonicalId;
}
