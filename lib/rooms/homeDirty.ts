export function markHomeRoomsDirty() {
  const stamp = String(Date.now());
  for (const storage of ["sessionStorage", "localStorage"] as const) {
    try {
      window[storage].setItem("HOME_DIRTY_V1", stamp);
    } catch {
      // Saving room media also works when storage is unavailable.
    }
  }
}
