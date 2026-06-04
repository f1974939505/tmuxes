# Agent Notes

- Keep `README.md` and `README.en.md` synchronized. When changing user-facing README content, update both language versions in the same change unless there is an explicit reason not to.
- Keep install commands, feature descriptions, requirements, FAQ entries, and changelog items aligned across both README files.
- `server/README.md` is the packaged README copy. If the root `README.md` changes and the package copy is kept in git, sync it too or run the prepack flow that copies it.
- If a README change intentionally applies to only one language, mention that explicitly in the final summary.
