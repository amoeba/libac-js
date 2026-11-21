# Migration notes

## 0.3.0 — service transport leaves libac

`@amoeba/libac` no longer exports the acdatservice-specific `multipart/mixed`
parser. Service-response framing is owned by the service client, so libac core
does not encode an HTTP/archive policy and cannot create a dependency cycle
between the native library and the service package.

Old root imports (removed):

```ts
import {
  extractBoundary,
  parseMultipartMixed,
  type MultipartPart,
} from "@amoeba/libac";
```

New imports:

```ts
import {
  extractBoundary,
  parseMultipartMixed,
  type MultipartPart,
} from "@amoeba/acdatservice-client/multipart";
```

The replacement is metadata-compatible and stricter:

- `parseMultipartMixed(body, contentTypeOrBoundary)` accepts either a complete
  `Content-Type` value or the legacy bare boundary token.
- `extractBoundary` accepts `string | null | undefined` and returns `null` when
  the parameter is absent.
- Parts still expose `fileId`, `contentType`, `filename`, `contentLocation` and
  an owned `body` copy.
- Malformed framing and invalid boundaries throw instead of silently skipping
  the whole response.
- Parts without a valid `Content-ID` are skipped, preserving the old behavior.

There is intentionally no re-export from `@amoeba/libac`, and
`@amoeba/acdatservice-client` is not a libac dependency.

## 0.3.0 — native landblock/landcell identity

Applications no longer need local copies of cell-DAT id arithmetic, ring block
coordinate encoding, or outdoor/interior cell classification. Import them from
the libac root:

```ts
import {
  blockId,
  blockXY,
  blockXOf,
  blockYOf,
  landblockFileId,
  blockIdOfFileId,
  LANDBLOCK_SUFFIX,
  LANDBLOCK_INFO_SUFFIX,
  landcellIndex,
  outdoorLandcellId,
  outdoorLandcellIdAtWorld,
  interiorLandcellId,
  landcellBlockId,
  landcellCellNumber,
  isOutdoorLandcellId,
  isInteriorLandcellId,
} from "@amoeba/libac";
```

Outdoor terrain cells are native `0x0001..0x0040`, not `0x0100..0x013f`.
Interior EnvCells remain `0x0100..0xfffd`. For example, landblock `0xAAB4`
maps local `(0, 0)` to `0xAAB40001` and `(191.9, 191.9)` to `0xAAB40040`;
`0xAAB40100` is an interior cell.

Coordinate helpers reject non-finite inputs and positions outside the owning
block (`0 <= localX, localY < 192`) with `RangeError`. Any UI clamping or border
normalization belongs in the application.

This release does **not** provide a universal `datFor(id)` helper. Cell and
portal resource ids overlap, so archive selection, high-resolution fallback,
URL building and loading policy stay in the application/service adapter.

## 0.3.0 — ACE held-equipment helpers

`heldPlacement` and `validateAttachmentFrame` are available from
`@amoeba/libac/ace`. They describe ACE equipment placement and frame validity
for that use, independently of service attachment serialization or wire budgets.

## ACE admin-only visibility

`passesAdminVisibilityCheck` is available from `@amoeba/libac/ace`. It models
ACE's `PropertyBool.Visibility` (18) / player `Adminvision` tracking gate. An
absent property defaults to false; admin-only objects require Adminvision.
This gate is independent of native `PhysicsState.NoDraw` and does not represent
the complete server tracking policy. Service transport flags and viewer
inspection controls remain with their respective consumers.
