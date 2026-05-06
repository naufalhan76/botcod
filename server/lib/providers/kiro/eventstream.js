/**
 * AWS EventStream binary protocol parser.
 *
 * Each frame:
 *   [total_length:4][headers_length:4][prelude_crc:4]
 *     [headers (variable)]
 *     [payload (variable)]
 *   [message_crc:4]
 *
 * All multi-byte numbers are big-endian.
 *
 * Each header (inside headers section):
 *   [name_length:1][name(utf-8)][value_type:1][value(variable)]
 *
 * Value types we care about for Kiro:
 *   0 = TRUE  (no value bytes)
 *   1 = FALSE (no value bytes)
 *   2 = BYTE     (1 byte signed)
 *   3 = SHORT    (2 bytes BE)
 *   4 = INTEGER  (4 bytes BE)
 *   5 = LONG     (8 bytes BE)
 *   6 = BYTE_ARRAY (2 byte BE length + data)
 *   7 = STRING     (2 byte BE length + utf-8)
 *   8 = TIMESTAMP  (8 bytes BE millis)
 *   9 = UUID       (16 bytes)
 *
 * This parser is incremental — feed bytes via `push()`, drain frames via `drain()`.
 */

const MIN_FRAME = 16;       // 4 (total) + 4 (headers) + 4 (prelude crc) + 4 (msg crc) at minimum
const MAX_FRAME = 16 * 1024 * 1024;

export class EventStreamParser {
    constructor() {
        this._buf = Buffer.alloc(0);
    }

    /**
     * Feed a chunk of bytes from the stream.
     * @param {Buffer|Uint8Array} chunk
     */
    push(chunk) {
        const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        // Avoid quadratic growth on small chunks: append efficiently.
        this._buf = this._buf.length === 0 ? b : Buffer.concat([this._buf, b]);
    }

    /**
     * Drain all complete frames currently in the buffer.
     * Returns an array of parsed messages: [{ headers: {...}, payload: Buffer }].
     * Throws on malformed frames.
     */
    drain() {
        const out = [];
        while (this._buf.length >= MIN_FRAME) {
            const totalLen = this._buf.readUInt32BE(0);
            if (totalLen < MIN_FRAME || totalLen > MAX_FRAME) {
                throw new Error(`event-stream: bogus total length ${totalLen}`);
            }
            if (this._buf.length < totalLen) break; // incomplete

            const frame = this._buf.subarray(0, totalLen);
            this._buf = this._buf.subarray(totalLen);

            const msg = parseFrame(frame);
            out.push(msg);
        }
        return out;
    }

    /**
     * Whether all buffered bytes have been consumed (no partial frame remaining).
     */
    isEmpty() {
        return this._buf.length === 0;
    }

    /**
     * Reset internal buffer. Used when a stream is aborted/finished.
     */
    reset() {
        this._buf = Buffer.alloc(0);
    }
}

function parseFrame(frame) {
    const totalLen = frame.readUInt32BE(0);
    const headersLen = frame.readUInt32BE(4);
    // const preludeCrc = frame.readUInt32BE(8);
    if (12 + headersLen + 4 > totalLen) {
        throw new Error(`event-stream: headers length ${headersLen} exceeds frame ${totalLen}`);
    }

    const headers = parseHeaders(frame.subarray(12, 12 + headersLen));
    const payloadStart = 12 + headersLen;
    const payloadEnd = totalLen - 4;
    const payload = frame.subarray(payloadStart, payloadEnd);
    return { headers, payload };
}

function parseHeaders(buf) {
    const headers = {};
    let off = 0;
    while (off < buf.length) {
        const nameLen = buf.readUInt8(off);
        off += 1;
        if (off + nameLen > buf.length) throw new Error('event-stream: header name overruns');
        const name = buf.subarray(off, off + nameLen).toString('utf-8');
        off += nameLen;
        const type = buf.readUInt8(off);
        off += 1;
        const { value, consumed } = readHeaderValue(buf, off, type);
        off += consumed;
        headers[name] = value;
    }
    return headers;
}

function readHeaderValue(buf, off, type) {
    switch (type) {
        case 0: return { value: true, consumed: 0 };
        case 1: return { value: false, consumed: 0 };
        case 2: return { value: buf.readInt8(off), consumed: 1 };
        case 3: return { value: buf.readInt16BE(off), consumed: 2 };
        case 4: return { value: buf.readInt32BE(off), consumed: 4 };
        case 5: return { value: Number(buf.readBigInt64BE(off)), consumed: 8 };
        case 6: {
            const len = buf.readUInt16BE(off);
            return { value: buf.subarray(off + 2, off + 2 + len), consumed: 2 + len };
        }
        case 7: {
            const len = buf.readUInt16BE(off);
            return {
                value: buf.subarray(off + 2, off + 2 + len).toString('utf-8'),
                consumed: 2 + len
            };
        }
        case 8: return { value: Number(buf.readBigInt64BE(off)), consumed: 8 };
        case 9: return { value: buf.subarray(off, off + 16).toString('hex'), consumed: 16 };
        default: throw new Error(`event-stream: unknown header type ${type}`);
    }
}

/**
 * Convenience: parse an entire (already-read) response body in one shot.
 * @param {Buffer} buf
 * @returns {Array<{headers: object, payload: Buffer}>}
 */
export function parseAll(buf) {
    const p = new EventStreamParser();
    p.push(buf);
    return p.drain();
}
