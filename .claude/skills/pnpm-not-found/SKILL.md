---
name: pnpm-not-found
description: Fix "pnpm command not found" errors by enabling corepack. Use when pnpm cannot be found, corepack errors appear, or package manager is missing.
---

# pnpm Not Found Fix

When you encounter errors like `pnpm: command not found` or `pnpm: not found`, fix by running:

```sh
corepack enable
```

If that fails with `EACCES: permission denied` (common in sandboxed containers), use a user-writable directory instead:

```sh
corepack enable --install-directory ~/.local/bin
export PATH="$HOME/.local/bin:$PATH"
```

Do this without asking the user first - just enable corepack and retry.
