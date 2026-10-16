# libac

TypeScript library for reading Asheron's Call DAT data structures and related
HTTP responses.

- Low-level binary reader (`BinaryReader`) and DAT models/types.
- Parsers for portal DAT file types: `GfxObj`, `Setup`, `SpellTable`, `Texture`.
- `multipart/mixed` HTTP response parsing (`extractBoundary`, `parseMultipartMixed`).
- Node-only, filesystem-backed DAT access (`SeekableFileReader`, `DatDatabase`, `DatReader`).

## Installation

```sh
npm install @amoeba/libac
```

The package is **ESM-only** and requires **Node.js 18 or newer**. A SideEffects-free
browser-safe (universal) build is included for bundlers.

## Which entrypoint?

| Entrypoint | Environment | What it includes |
| --- | --- | --- |
| `@amoeba/libac` | Browser / universal | Everything that is safe in any JS runtime: `BinaryReader`, `DatFile`/`DatFileType`, `GfxObj`, `Setup`, `SpellTable`, `Texture`, the `dat/types` models, the unpackables, and the multipart helpers. No Node built-ins, `Buffer`, or `fs`. |
| `@amoeba/libac/node` | Node.js | The entire universal API **plus** the filesystem-backed DAT reading: `SeekableFileReader`, `DatDatabase`, `DatReader`. |

The `/node` entry re-exports everything from the root entry, so in Node you can
import your whole API from `@amoeba/libac/node`.

> Browser DAT **file** reading is not supported yet — it will require an
> HTTP-Range-based reader in a future release. In the browser you can still
> parse in-memory buffers (`GfxObj.fromBuffer`, `Setup.fromBuffer`) and the
> multipart helpers.

## Usage

### Browser / universal

`GfxObj.fromBuffer` and `Setup.fromBuffer` accept either a `Uint8Array` or an
`ArrayBuffer`. Multipart helpers operate on `Uint8Array`/`ArrayBuffer` bytes.

```ts
import {
  GfxObj,
  Setup,
  extractBoundary,
  parseMultipartMixed,
} from "@amoeba/libac";

// Parse an in-memory DAT file buffer.
const setup = Setup.fromBuffer(setupBytes);
const gfxObj = GfxObj.fromBuffer(gfxObjBytes);

console.log(setup.parts);      // referenced GfxObj IDs
console.log(gfxObj.surfaces);  // texture references

// Parse a multipart/mixed response body.
const boundary = extractBoundary(contentType);
if (boundary) {
  const parts = parseMultipartMixed(responseBytes, boundary);
  for (const part of parts) {
    console.log(part.fileId, part.filename, part.body);
  }
}
```

### Node.js

Import from the `/node` subpath to get the universal API plus DAT reading from a
file on disk.

```ts
import { DatDatabase, GfxObj } from "@amoeba/libac/node";

const db = new DatDatabase("path/to/portal.dat");
db.read(); // reads the header and root directory

// ...use db.reader / db.header / db.rootDir to locate and load file data...

db.close();
```

## Migrating from 0.1.0

`SeekableFileReader`, `DatDatabase`, and `DatReader` no longer ship from the
package root because they depend on Node's `fs`. They now live under the
`/node` subpath:

```ts
// Before (0.1.0)
import { DatDatabase } from "@amoeba/libac";

// After (0.2.0)
import { DatDatabase } from "@amoeba/libac/node";
```

Everything else keeps its existing import path at the package root.

## Status

`0.2.0` is an initial `0.x` API. Public exports and their shapes may change in
future `0.x` releases.
