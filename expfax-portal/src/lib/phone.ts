// Phone number normalization & formatting.
//
// Storage rule: only digits, optionally with a single leading "+".
// Anything else (spaces, dashes, parens, dots, letters) is stripped.
//
// Display rule:
//   10 digits           → "(555) 555-5555"
//   11 digits, "1…"      → "+1 (555) 555-5555"
//   leading "+" present  → "+CC (XXX) XXX-XXXX" when the country code is 1
//                          and 10 subscriber digits remain; otherwise the raw
//                          "+<digits>" is returned untouched.
//   anything else        → returned as-is (after digit-stripping) so partial
//                          input keeps showing while the user is typing.
//
// These helpers are used at every boundary: form inputs (onChange + onBlur),
// API route handlers before persisting / sending to FaxBack, and every
// display site in the UI.

/** Strip everything except digits, preserving at most one leading "+". */
export function normalizePhone(input: string | null | undefined): string {
  if (!input) return "";
  const trimmed = String(input).trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D+/g, "");
  return hasPlus ? `+${digits}` : digits;
}

/** Pretty-print a normalized number. Accepts already-normalized or raw input.
 *  Falls back to the digit-stripped form when the number is shorter or has
 *  an unsupported country code, so partial values during typing still render. */
export function formatPhone(input: string | null | undefined): string {
  const n = normalizePhone(input);
  if (!n) return "";

  // Plain 10-digit US/CA number
  if (!n.startsWith("+") && n.length === 10) {
    return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
  }
  // 11-digit "1XXXXXXXXXX" → +1 (XXX) XXX-XXXX
  if (!n.startsWith("+") && n.length === 11 && n.startsWith("1")) {
    const r = n.slice(1);
    return `+1 (${r.slice(0, 3)}) ${r.slice(3, 6)}-${r.slice(6)}`;
  }
  // Explicit country code: only "+1" + 10 digits gets pretty NANP formatting.
  if (n.startsWith("+1") && n.length === 12) {
    const r = n.slice(2);
    return `+1 (${r.slice(0, 3)}) ${r.slice(3, 6)}-${r.slice(6)}`;
  }
  // Other country codes / partial input — return digits-only (with +) as-is.
  return n;
}

/** Convenience for inputs: format on blur if the value looks complete,
 *  otherwise keep the raw normalized form so the cursor doesn't jump. */
export function formatOnBlur(input: string | null | undefined): string {
  const n = normalizePhone(input);
  if (!n) return "";
  // Only auto-format when we have a complete recognizable shape.
  if (
    (!n.startsWith("+") && (n.length === 10 || (n.length === 11 && n.startsWith("1")))) ||
    (n.startsWith("+1") && n.length === 12)
  ) {
    return formatPhone(n);
  }
  return n;
}

/** Quick predicate: is this a valid-looking dial string?
 *  Used as a soft check before submission — at least 7 digits. */
export function isLikelyValidPhone(input: string | null | undefined): boolean {
  const n = normalizePhone(input);
  const digits = n.replace(/\D/g, "");
  return digits.length >= 7;
}
