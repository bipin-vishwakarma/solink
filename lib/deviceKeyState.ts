export type DeviceKeyState =
  | "matching"
  | "recovery-required"
  | "history-unavailable";

/**
 * Decide whether this installation can safely use the account's established
 * encryption identity. A mismatch is never permission to overwrite the
 * account key: Google SSO proves account ownership, not possession of the E2EE
 * private key that encrypted existing history.
 */
export function classifyDeviceKey(
  localPublicKey: string,
  profilePublicKey: string,
  backupExists: boolean
): DeviceKeyState {
  if (localPublicKey === profilePublicKey) return "matching";
  return backupExists ? "recovery-required" : "history-unavailable";
}
