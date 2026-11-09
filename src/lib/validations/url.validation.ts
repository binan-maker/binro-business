/**
 * Validates that a return or redirect URL is a safe same-origin relative path.
 * Strictly rejects:
 * - External schemes (http:, https:, javascript:, data:, etc.)
 * - Protocol-relative paths (//evil.com, ///evil.com)
 * - Backslashes (/\evil.com, \\evil.com)
 * - Encoded bypass attempts (%2f%2f, %5c, %25)
 * - Control characters / CRLF injection
 *
 * Returns the normalized safe relative path (e.g. '/dashboard', '/invite/xyz') or null if invalid.
 */
export function getSafeReturnUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  // Must begin with a single slash; disallow double slashes or backslashes
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) {
    return null;
  }

  // Reject CR/LF, null bytes or control characters
  if (/[\r\n\0]/.test(trimmed)) {
    return null;
  }

  // Reject URL-encoded characters that could evade slash/backslash checks
  const lower = trimmed.toLowerCase();
  if (lower.includes("%2f%2f") || lower.includes("%5c") || lower.includes("%25")) {
    return null;
  }

  try {
    const dummyBase = "http://localhost";
    const parsed = new URL(trimmed, dummyBase);

    // Ensure origin remained identical to dummy base (no domain/protocol hijack)
    if (parsed.origin !== dummyBase) {
      return null;
    }

    // Ensure pathname still begins with single '/' and no protocol-relative segment
    if (!parsed.pathname.startsWith("/") || parsed.pathname.startsWith("//")) {
      return null;
    }

    return parsed.pathname + parsed.search;
  } catch {
    return null;
  }
}
