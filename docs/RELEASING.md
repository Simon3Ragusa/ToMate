# Releasing ToMate

Steps marked **(you)** need the maintainer: an account, a secret, or a decision. Everything else is automated or already in the repo.

## One-time setup

1. **License:** MIT (chosen 2026-10-30), in `LICENSE`.
2. **(you) Check the name.** Search for existing products called "ToMate" before going public.
3. **(you) Create the GitHub repository** and push this branch. Public is recommended: Actions minutes, including macOS later, are free for public repos.
4. **(you) Auto-update key** (optional, enables the in-app updater):
   - Run `npm run tauri signer generate -- -w ~/.tauri/tomate.key` and keep the private key and its password safe. Never commit them.
   - In the repository's Settings → Secrets → Actions, add `TAURI_SIGNING_PRIVATE_KEY` (the file's content) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
   - Then the updater plugin can be wired in, with the public key in `tauri.conf.json` and the endpoint pointing at `releases/latest/download/latest.json`. An agent can do that part.

## Each release

1. Bump `version` in `package.json` and `src-tauri/tauri.conf.json` (keep them equal).
2. Commit, then tag and push: `git tag v0.2.0 && git push origin v0.2.0`.
3. The **Release** workflow builds the installer and attaches it to a **draft** release.
4. **(you)** Review the draft, write the notes, and publish it.

## Not yet

- **Code signing** removes the "Windows protected your PC" warning. It costs roughly €100–300 a year; worth it only once strangers download the app.
- **macOS builds:** add `macos-latest` to the workflow matrix once slide previews and the notch have non-Windows fallbacks.
