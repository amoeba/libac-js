# Test fixtures

Recorded HTTP responses from the public Asheron's Call DAT service
`https://dats.treestats.net`, used by `src/parsers.test.ts` so the test suite
stays hermetic. The live host returns **403 to GitHub Actions runners**, so the
tests read these committed bytes instead of fetching at test time.

| File | Source URL | Bytes | SHA-256 |
| --- | --- | --- | --- |
| `gfxobj-0x010008AB.bin` | `https://dats.treestats.net/dats/portal/files/0x010008AB` | 3504 | `077ac293fe8d82c7dd41b122886fa121ee66b32f1213d3c476496bb6aa9c9dcb` |
| `setup-0x02000108.bin` | `https://dats.treestats.net/dats/portal/files/0x02000108` | 160 | `e6cd29e5aa80f09d181e74703e2dd78756eb90d5098bf2db65b71c32b2e9ad2c` |
| `multipart-0x02000108.bin` | `https://dats.treestats.net/setups/0x02000108?include=gfxobjs` | 4118 | `ed69b223e7eb7068f1e6d4b59c159791eebe39a4febdc1997dd1ff898c13b019` |
| `setup-0x02000116.bin` | ac-noclip `test/fixtures/meetinghall` (portal DAT `0x02000116`) | 196 | `b19e408b7fb9bbd65153f587699f9667d027bb6c91b97e455d3d3ae4425c14db` |
| `setup-0x02000065.bin` | ac-noclip `test/fixtures/meetinghall` (portal DAT `0x02000065`, has a `Resting` placement frame) | 416 | `2a1352873e172d09eaf6c7d83a6640997420d9a30c7e9ead8ac4144366083dc0` |

`multipart-0x02000108.bin` is the raw multipart **body** only. The recorded
`Content-Type` header (asserted in the test) is
`multipart/mixed; boundary=acdatservice-02000108-0`.

## Refresh

```sh
curl -fsS -o src/__fixtures__/gfxobj-0x010008AB.bin \
  "https://dats.treestats.net/dats/portal/files/0x010008AB"
curl -fsS -o src/__fixtures__/setup-0x02000108.bin \
  "https://dats.treestats.net/dats/portal/files/0x02000108"
curl -fsS -o src/__fixtures__/multipart-0x02000108.bin \
  "https://dats.treestats.net/setups/0x02000108?include=gfxobjs"
```

These are static portal-DAT assets; the IDs are stable, so refreshes should
rarely change the bytes. If they do, update the table above and any assertions
in `src/parsers.test.ts` that depend on the parsed shape.
