# Development

## Install

Use Node.js 24 (the release workflow version). From the repository root:

```sh
npm ci
```

This installs dependencies and builds the package.

## Test

```sh
npm test        # unit tests
npm run verify  # build, browser checks, and unit tests
```

## Release

Update `package.json` and `package-lock.json` to the intended version and merge
the changes into `main`. Then tag that commit (replace `0.2.4` as needed):

```sh
git switch main
git pull --ff-only
git tag v0.2.4
git push origin v0.2.4
```

The tag must match the package version and be a stable version (`vX.Y.Z`).
The [release workflow](.github/workflows/release.yml) runs verification,
publishes to npm, and creates a GitHub release with generated notes.

Publishing uses npm's trusted publisher for `amoeba/libac-js`, workflow
`release.yml`, with no environment and direct publishing allowed. No npm token
secret is needed.
