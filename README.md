# libac

TypeScript library for reading Asheron's Call DAT data structures and related
HTTP responses.

- Low-level binary reader (`BinaryReader`) and DAT models/types.
- Parsers for portal and cell DAT file types: `GfxObj`, `Setup`, `Texture`,
  `Surface`, `SurfaceTexture`, `Palette`, `Region`, `Scene`, `CellLandblock`,
  `LandblockInfo`, `EnvCell`, `Environment`, `MotionTable`, `Animation`.
- Length-correct animation hooks (`AnimationFrame`, `readAnimationHook`, all 27
  `AnimationHookType` payloads), reusable by `PhysicsScript` (0x33).
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
| `@amoeba/libac` | Browser / universal | Everything that is safe in any JS runtime: `BinaryReader`, `DatFile`/`DatFileType`, `GfxObj`, `Setup`, `SpellTable`, `Texture`, `MotionTable`, `Animation`, the `dat/types` models, the unpackables, and the multipart helpers. No Node built-ins, `Buffer`, or `fs`. |
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

## Releasing

Stable releases are published by `.github/workflows/release.yml` when a `v*` tag
is pushed. The tag must match the version in `package.json` (for example,
`v0.2.4` for version `0.2.4`). The workflow runs `npm run verify`, publishes to
npm, and then creates a GitHub release with generated release notes.

The npm package's trusted publisher must allow direct publishing from GitHub
owner `amoeba`, repository `libac-js`, workflow `release.yml`, with no environment.
No npm token secret is needed.

To release, update `package.json` and `package-lock.json` to the intended version,
merge those changes and the release workflow into `main`, then tag that commit:

```sh
git switch main
git pull --ff-only
git tag v0.2.4
git push origin v0.2.4
```

Use the intended version in place of `0.2.4`; npm versions cannot be republished.
