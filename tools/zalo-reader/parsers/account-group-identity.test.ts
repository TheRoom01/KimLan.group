import assert from "node:assert/strict";
import { canonicalAccountGroup } from "../account-group-identity";
const proof = { canonicalId: "g1986619726266954037", accountId: "g6040898958385854853", observedId: "g6040898958385854853", exactResultCount: 1, matchedDomIds: 20, trusted: true };
assert.equal(canonicalAccountGroup(proof), proof.canonicalId);
for (const invalid of [{ matchedDomIds: 0 }, { exactResultCount: 2 }, { trusted: false }, { observedId: "g1506001042738564534" }, { accountId: "bad" }]) {
  assert.throws(() => canonicalAccountGroup({ ...proof, ...invalid }), /ACCOUNT_GROUP_ID_UNVERIFIED/);
}
console.log("PASS: verified account alias preserves canonical identity; wrong/ambiguous/unproven groups rejected");
