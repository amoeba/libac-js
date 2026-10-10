# libac

TypeScript library for reading Asheron's Call DAT data structures and related
HTTP responses. This initial release supports the low-level binary readers,
portal DAT traversal, GfxObj and Setup parsing, and `multipart/mixed` response
parsing.

## Installation

```sh
npm install @amoeba/libac
```

Requires Node.js 18 or newer.

## Usage

```ts
import { GfxObj, Setup, extractBoundary, parseMultipartMixed } from "@amoeba/libac";

const setup = Setup.fromBuffer(setupBytes);
const gfxObj = GfxObj.fromBuffer(gfxObjBytes);

const boundary = extractBoundary(contentType);
if (boundary) {
  const parts = parseMultipartMixed(responseBytes, boundary);
}
```

`Setup.fromBuffer` and `GfxObj.fromBuffer` accept either an `ArrayBuffer` or a
`Uint8Array`, including Node.js `Buffer` instances.

## Status

`0.1.0` is an initial API release. Public exports are available from the
package root and include the readers, DAT models, GfxObj/Setup parsers, and
multipart helpers. The API may change in future `0.x` releases.
