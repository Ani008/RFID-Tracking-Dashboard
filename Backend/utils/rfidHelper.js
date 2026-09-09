/**
 * Normalizes an RFID tag string.
 * If given a 32-hex character desktop scan string (16 bytes containing CRC + reversed EPC + PC, e.g. BF064701000000000000000000000030),
 * extracts and reverses the 12-byte EPC into the canonical 24-hex EPC format (000000000000000000000147).
 * Otherwise returns the trimmed uppercase hex string.
 *
 * @param {string} tag
 * @returns {string}
 */
export function normalizeRfidTag(tag) {
  if (!tag || typeof tag !== 'string') return '';
  const cleaned = tag.trim().toUpperCase().replace(/[^0-9A-F]/g, '');

  // 32 hex chars = 16 bytes = 2 CRC + 12 reversed EPC + 2 PC from desktop reader
  if (cleaned.length === 32) {
    const buf = Buffer.from(cleaned, 'hex');
    const epcBuf = Buffer.from(buf.subarray(2, 14)).reverse();
    return epcBuf.toString('hex').toUpperCase();
  }

  return cleaned;
}
