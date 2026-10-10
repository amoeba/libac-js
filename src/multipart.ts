/**
 * Parser for `multipart/mixed` HTTP response bodies.
 *
 * Consumes the response from `GET /setups/:id?include=gfxobjs` and splits it
 * into individual parts keyed by their file IDs.
 */

export interface MultipartPart {
  /** File ID extracted from `Content-ID: <0xXXXXXXXX>`. */
  fileId: number;

  /** Content-Type of the part (e.g. "application/octet-stream"). */
  contentType: string;

  /** Filename from Content-Disposition (e.g. "0x02000108.setup.bin"). */
  filename: string;

  /** Canonical URI from Content-Location (e.g. "/dats/portal/files/0x02000108"). */
  contentLocation: string;

  /** The raw binary body of the part. */
  body: Uint8Array;
}

/** Extract the boundary string from a Content-Type header value. */
export function extractBoundary(contentType: string): string | null {
  // Content-Type: multipart/mixed; boundary=acdatservice-02000108-0
  const match = contentType.match(/boundary=(.+)$/i);
  if (!match) return null;
  // Boundary may or may not be quoted
  let boundary = match[1].trim();
  if (boundary.startsWith('"') && boundary.endsWith('"')) {
    boundary = boundary.slice(1, -1);
  }
  return boundary;
}

/** Parse a `multipart/mixed` body into its constituent parts.

 * Follows RFC 2046: parts are separated by `--{boundary}\r\n`, headers and
 * body are separated by `\r\n\r\n`, and the response ends with
 * `--{boundary}--\r\n`.
 *
 * This mirrors the exact encoding produced by `encode_multipart_mixed` in
 * `routes.rs`, which uses CRLF framing and no preamble.
 */
export function parseMultipartMixed(
  body: Uint8Array,
  boundary: string
): MultipartPart[] {
  const delimiter = new TextEncoder().encode(`--${boundary}`);
  const parts: MultipartPart[] = [];

  // Split on the delimiter. The body structure is:
  //   (preamble -- usually empty)
  //   --boundary\r\n  headers\r\n\r\n  body\r\n
  //   --boundary\r\n  headers\r\n\r\n  body\r\n
  //   --boundary--\r\n
  const bodyStr = new TextDecoder().decode(body);
  const segments = splitOnDelimiter(body, delimiter);

  for (const segment of segments) {
    // Skip empty segments (preamble) and the closing delimiter
    if (segment.length === 0) continue;

    // The closing delimiter segment starts with "--\r\n"
    const tail = segment.slice(0, 4);
    if (new TextDecoder().decode(tail) === "--\r\n") continue;

    // Each part segment starts with \r\n (after the boundary delimiter)
    // and ends with \r\n (before the next boundary delimiter).
    // Strip leading CRLF if present.
    let offset = 0;
    if (segment.length >= 2 && segment[0] === 0x0d && segment[1] === 0x0a) {
      offset = 2;
    }

    // Find the header/body separator: \r\n\r\n
    const headerEnd = findCrlfCrlf(segment, offset);
    if (headerEnd === -1) continue;

    const headerBytes = segment.slice(offset, headerEnd);
    const bodyBytes = segment.slice(headerEnd + 4);

    // Strip trailing \r\n from the body
    let bodyEnd = bodyBytes.length;
    if (bodyEnd >= 2 && bodyBytes[bodyEnd - 2] === 0x0d && bodyBytes[bodyEnd - 1] === 0x0a) {
      bodyEnd -= 2;
    }

    const headers = parseHeaders(new TextDecoder().decode(headerBytes));
    const fileId = parseContentId(headers["content-id"]);
    if (fileId === null) continue;

    parts.push({
      fileId,
      contentType: headers["content-type"] || "application/octet-stream",
      filename: parseFilename(headers["content-disposition"] || ""),
      contentLocation: headers["content-location"] || "",
      body: bodyBytes.slice(0, bodyEnd),
    });
  }

  return parts;
}

/** Split a Uint8Array on a byte delimiter, returning the segments between. */
function splitOnDelimiter(
  data: Uint8Array,
  delimiter: Uint8Array
): Uint8Array[] {
  const segments: Uint8Array[] = [];
  let start = 0;

  for (let i = 0; i <= data.length - delimiter.length; i++) {
    let match = true;
    for (let j = 0; j < delimiter.length; j++) {
      if (data[i + j] !== delimiter[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      segments.push(data.slice(start, i));
      start = i + delimiter.length;
    }
  }

  // Trailing segment after the last delimiter
  segments.push(data.slice(start));

  return segments;
}

/** Find the offset of \r\n\r\n starting from a given position. */
function findCrlfCrlf(data: Uint8Array, start: number): number {
  for (let i = start; i + 3 < data.length; i++) {
    if (data[i] === 0x0d && data[i + 1] === 0x0a && data[i + 2] === 0x0d && data[i + 3] === 0x0a) {
      return i;
    }
  }
  return -1;
}

/** Parse HTTP-style headers into a lowercased-key map. */
function parseHeaders(headerText: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const lines = headerText.split("\r\n");
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    headers[key] = value;
  }
  return headers;
}

/** Extract the uint32 file ID from `Content-ID: <0x02000108>`. */
function parseContentId(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/0x([0-9A-Fa-f]+)/);
  if (!match) return null;
  return parseInt(match[1], 16) >>> 0;
}

/** Extract the filename from `Content-Disposition: attachment; filename="0x02000108.bin"`. */
function parseFilename(value: string): string {
  const match = value.match(/filename="([^"]+)"/);
  return match ? match[1] : "";
}
