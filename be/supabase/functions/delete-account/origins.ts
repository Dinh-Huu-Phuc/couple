// Keep the current app domain available without an out-of-band secret update.
// Extra preview origins must still be explicitly configured, never wildcarded.
export function deletionOrigins(extra = "") {
  return new Set([
    "https://app.coupleletters.app",
    "https://coupleletters.app",
    "https://www.coupleletters.app",
    "http://127.0.0.1:3001",
    "http://localhost:3001",
    "http://127.0.0.1:3100",
    ...extra
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  ]);
}
