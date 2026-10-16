#!/usr/bin/env node
// Guardrail: ensure the browser/universal build never pulls in Node built-ins or
// the `Buffer` global. Scans built `dist/` (excluding `dist/node/`) for `.js` and
// `.d.ts` files and fails with a file:line:match report on the first violation.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const distDir = join(rootDir, "dist");
// Directory (relative to dist, POSIX-style) that holds the Node entrypoint build.
const NODE_SUBDIR = "node";

/**
 * Each rule has a human-readable label and a regex. The regexes are written so
 * that innocuous tokens such as `ArrayBuffer` or `fromBuffer` do not match the
 * standalone `Buffer` rule.
 */
const RULES = [
  {
    label: "standalone `Buffer` token (use ArrayBuffer/Uint8Array instead)",
    // \b ensures `ArrayBuffer` and `fromBuffer` are NOT flagged.
    pattern: /\bBuffer\b/g,
  },
  {
    label: "CommonJS `require(` in an ESM browser build",
    pattern: /\brequire\s*\(/g,
  },
  {
    label: "Node built-in import (`node:` specifier)",
    pattern: /(?:from\s*["']node:|import\s*\(\s*["']node:)/g,
  },
  {
    label: 'fs import (`"fs"` / `"node:fs"`)',
    pattern: /from\s*["'](?:node:)?fs["']/g,
  },
];

if (!isDirectory(distDir)) {
  console.error(
    "check-browser-bundle: `dist/` does not exist.\n" +
      "Run `npm run build` first, then re-run `npm run check:browser`.",
  );
  process.exit(1);
}

const files = collectFiles(distDir);
const violations = [];

for (const file of files) {
  const rel = relative(distDir, file).split(sep).join("/");
  // Exclude the Node-only build output entirely.
  if (rel === NODE_SUBDIR || rel.startsWith(`${NODE_SUBDIR}/`)) continue;

  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const rule of RULES) {
      rule.pattern.lastIndex = 0;
      let match;
      while ((match = rule.pattern.exec(line)) !== null) {
        violations.push({
          file: `dist/${rel}`,
          line: index + 1,
          column: match.index + 1,
          match: match[0],
          label: rule.label,
        });
      }
    }
  });
}

if (violations.length > 0) {
  console.error(
    `check-browser-bundle: found ${violations.length} Node/Buffer violation(s) in the browser build:\n`,
  );
  for (const v of violations) {
    console.error(
      `  ${v.file}:${v.line}:${v.column}: ${JSON.stringify(v.match)} — ${v.label}`,
    );
  }
  console.error(
    "\nThe browser entry (`@amoeba/libac`) must not depend on Node built-ins or `Buffer`.",
  );
  process.exit(1);
}

console.log(
  `check-browser-bundle: OK — scanned ${files.length} file(s) in dist/ (excluding dist/node/), no Node/Buffer usage found.`,
);

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function collectFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFiles(full));
    } else if (entry.isFile() && /\.(?:js|d\.ts)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}
