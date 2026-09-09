/**
 * Normalizes an RFID tag string.
 * Converts 32-character desktop scanner output (CRC + reversed EPC + PC) to canonical 24-character EPC.
 *
 * @param {string} tag
 * @returns {string}
 */
export function normalizeRfidTag(tag) {
  if (!tag || typeof tag !== 'string') return '';
  const cleaned = tag.trim().toUpperCase().replace(/[^0-9A-F]/g, '');

  // 32 hex chars = 16 bytes: byte 0-1 (CRC), byte 2-13 (12-byte reversed EPC), byte 14-15 (PC)
  if (cleaned.length === 32) {
    const epcHex = cleaned.slice(4, 28); // 12 bytes = 24 hex characters
    // Reverse byte pairs
    let reversed = '';
    for (let i = epcHex.length - 2; i >= 0; i -= 2) {
      reversed += epcHex.slice(i, i + 2);
    }
    return reversed;
  }

  return cleaned;
}
