/** All IANA time zones the server knows, for pickers. */
export function allTimeZones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["Asia/Kolkata", "America/New_York", "America/Chicago", "America/Los_Angeles", "Europe/London", "UTC"];
  }
}
