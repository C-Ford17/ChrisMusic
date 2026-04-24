<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Windows / PowerShell Rules
- When running commands on Windows, use PowerShell syntax.
- Use `;` instead of `&&` for command chaining.
- Use `copy` or `cp-r` carefully with powershell paths.

# Release & Versioning Rules
- NEVER push changes to the repository without first running `npm run build` locally and ensuring it passes successfully.
- NEVER perform a version bump (bump.js, tags, or package.json version changes) without explicit and direct permission from the USER.
<!-- END:nextjs-agent-rules -->
