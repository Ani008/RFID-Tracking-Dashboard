/**
 * Implements the byte-level framing from "MM Version Reader Control Protocol
 * v1.2" — the protocol your door/gate antenna reader speaks over RS232,
 * RS485, or a raw TCP socket (the reader's LAN port just tunnels the same
 * bytes; the frame format never changes).
 *
 * Frame layout (Table 2-1 in the spec):
 *   SOI(1) ADR_LSB(1) ADR_MSB(1) CID1(1) CID2_or_RTN(1) LENGTH(1) INFO(LENGTH) CHKSUM(1)
 *
 *   - Command frames (SU -> reader):  SOI = 0x7C
 *   - Response frames (reader -> SU): SOI = 0xCC
 *
 * CHKSUM = two's complement of the sum of every other byte in the frame,
 * mod 256 (spec section 2.3 — confirmed against the worked example there).
 */

export const SOI_CMD = 0x7c;
export const SOI_RESP = 0xcc;

export const CID1 = {
  READ_UII: 0x20,
  SET_BASE_PARAMS: 0x81,
  GET_BASE_PARAMS: 0x81,
};

export const CID2 = {
  NONE: 0x00,
  SET: 0x31,
  GET: 0x32,
};

export const RTN = {
  OK: 0x00,
  FAIL: 0x01,
  CMD_RESPONSE: 0x02,
  AUTO_SEND: 0x05, // reader is in Active/auto mode — tag frames arrive unsolicited with this RTN instead of 0x02
};

/** Sum every byte, mod 256, then two's complement (spec 2.3). */
export function checksum(bytes) {
  let sum = 0;
  for (let i = 0; i < bytes.length; i++) sum = (sum + bytes[i]) & 0xff;
  return (~sum + 1) & 0xff;
}

/**
 * Builds a command frame ready to write to the transport.
 * @param {number} cid1
 * @param {number} cid2
 * @param {Buffer} [info]
 * @param {number} [adr] - default 0xFFFF = public/broadcast address (fine for a single reader)
 */
export function buildCommand(cid1, cid2, info = Buffer.alloc(0), adr = 0xffff) {
  const adrLsb = adr & 0xff;
  const adrMsb = (adr >> 8) & 0xff;
  const head = Buffer.from([SOI_CMD, adrLsb, adrMsb, cid1, cid2, info.length]);
  const withoutChecksum = Buffer.concat([head, info]);
  const cks = checksum(withoutChecksum);
  return Buffer.concat([withoutChecksum, Buffer.from([cks])]);
}

/**
 * Stateful byte-stream -> frame parser. Feed it raw chunks as they arrive
 * from the serial port or TCP socket; it returns any complete, checksum-
 * verified response frames found so far and keeps partial data buffered
 * for the next call.
 */
export function createFrameParser() {
  let buf = Buffer.alloc(0);

  function drain() {
    const frames = [];
    for (;;) {
      const soiIdx = buf.indexOf(SOI_RESP);
      if (soiIdx === -1) {
        // No response-start byte at all in what we have — nothing usable yet.
        if (buf.length > 0) buf = Buffer.alloc(0);
        break;
      }
      if (soiIdx > 0) buf = buf.subarray(soiIdx); // drop noise before the SOI

      // Need SOI + ADR(2) + CID1 + RTN + LENGTH = 6 bytes to know the full frame size.
      if (buf.length < 6) break;

      const length = buf[5];
      const totalLen = 6 + length + 1; // + 1 checksum byte
      if (buf.length < totalLen) break; // wait for more bytes

      const frame = buf.subarray(0, totalLen);
      const withoutChecksum = frame.subarray(0, totalLen - 1);
      const expectedCks = frame[totalLen - 1];
      const actualCks = checksum(withoutChecksum);

      if (actualCks !== expectedCks) {
        // Bad frame (or we resynced on a stray 0xCC byte inside binary EPC
        // data). Drop just this SOI byte and try again from the next one.
        buf = buf.subarray(1);
        continue;
      }

      buf = buf.subarray(totalLen);
      frames.push({
        adr: frame[1] | (frame[2] << 8),
        cid1: frame[3],
        rtn: frame[4],
        length,
        info: frame.subarray(6, 6 + length),
      });
    }
    return frames;
  }

  return {
    /** @param {Buffer} chunk @returns {Array<{adr:number,cid1:number,rtn:number,length:number,info:Buffer}>} */
    push(chunk) {
      buf = Buffer.concat([buf, chunk]);
      return drain();
    },
  };
}

/**
 * Parses a "Read Type C UII" tag-read frame (spec 4.1.2).
 * INFO = ANT(1) + PC(2) + EPC(variable) + RSSI(1).
 * Returns null for anything that isn't an actual tag read (e.g. the
 * end-of-inventory summary frame, which reuses CID1=0x20 with a 3-byte INFO).
 */
export function parseTagFrame(frame) {
  if (frame.cid1 !== CID1.READ_UII) return null;
  if (frame.rtn !== RTN.CMD_RESPONSE && frame.rtn !== RTN.AUTO_SEND) return null;
  if (frame.length < 4) return null; // too short to hold ANT+PC+EPC+RSSI — it's the summary frame

  const info = frame.info;
  const ant = info[0];
  const pc = info.readUInt16BE(1);
  const epc = info.subarray(3, info.length - 1).toString('hex').toUpperCase();
  const rssi = info[info.length - 1];
  return { ant, pc, epc, rssi };
}