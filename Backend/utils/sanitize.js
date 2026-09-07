/**
 * Defense-in-depth sanitization helper for stored free-text strings
 */
export function sanitizeText(input) {
  if (typeof input !== 'string') return input;
  return input
    .replace(/[<>]/g, '') // Strip HTML angle brackets to prevent stored script injection
    .trim();
}
