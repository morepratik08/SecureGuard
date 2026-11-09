// Reuse this helper in account provisioning so stored and login email forms match.
export function normalizeEmail(value) {
  return value.trim().toLowerCase();
}
