# ChrisMusic - Critical Agent Rules

## ⚠️ MANDATORY: Versioning & Releases
- **NEVER** run `node bump.js`, create `git tag`, or modify versions in `package.json` / `tauri.conf.json` without **explicit and direct permission** from the USER for each specific version.
- **NEVER** push to the repository without first running `npm run build` and verifying it passes.

## 🛠️ Windows / PowerShell
- Use `;` instead of `&&`.
- Use PowerShell syntax for environment variables if needed.

## 📁 Paths
- Use absolute paths when possible.
- Normalize URLs for cross-platform compatibility (Android uses `file://`, PC uses `blob:` or `asset:`).
