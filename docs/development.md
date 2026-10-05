# Developing Ledger

Run commands from the repository root unless a native harness explicitly gives a disposable workspace. Command definitions live in [package.json](../package.json); CI lives in [ci.yml](../.github/workflows/ci.yml).

## Setup and dev modes

Native development requires macOS, Node.js 22/npm, stable Rust and Xcode Command Line Tools. CI runs frontend checks on Linux and Rust checks on macOS. `src-tauri/Cargo.toml` declares the Rust minimum; use stable as CI does. Install JavaScript dependencies with the committed lockfile:

```bash
npm ci
```

| Command | Behavior |
| --- | --- |
| `npm run dev` | Vite UI at `http://localhost:5174` |
| `npm run tauri:dev` | Native app; Tauri starts Vite via `beforeDevCommand` |
| `npm run preview` | Preview an already built static frontend |
| `npm run build` | SvelteKit static frontend in `build/` |
| `npm run tauri:build` | Native release and bundles; runs the frontend build first |

Browser mode initializes Dexie defaults and retains browser IndexedDB; it does not load/write desktop JSON or exercise native APIs. The native main window hydrates Dexie from the selected file at startup. Quick Add intentionally skips this initialization.

Normal native dev uses `app.ledger.desktop`, including the same application-support directory and SimpleFIN Keychain service as the installed app. For fixture testing, use the separate identifiers in [tools/native-smoke](../tools/native-smoke/README.md). Do not run two main-window writers against the same data directory.

## Checks and tests

The frontend CI commands are:

```bash
npm run lint
npm run check
npm run test:run
```

`npm test` / `npm run test` starts Vitest watch mode. For a finite focused run:

```bash
npm run test:run -- src/lib/storage/durable-save.test.ts
```

[vitest.config.ts](../vitest.config.ts) discovers tests under all of `src/`, including colocated tests and `src/tests/`. It uses jsdom, fake IndexedDB and the setup in `src/tests/setup.ts`; Svelte resolves its browser condition so Testing Library can render components. Tauri filesystem/event APIs are mocked by the tests that need them. Follow a nearby test's setup; `src/lib/components/__tests__/setup.ts` is a separate helper, not the global setup file.

Regression tests should cover observable behavior: cent allocation, date boundaries, transaction rollback, applied-but-unsaved retry, interleaving operations and mounted UI refresh. Use synthetic data. Add rendered component coverage when a store-only test would miss the reported failure.

Rust checks require macOS frameworks and an existing `build/` directory because `tauri::generate_context!` references `frontendDist`. CI creates an empty directory for compilation; running the app needs the actual frontend build.

```bash
mkdir -p build
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

When the Cargo registry/dependencies are already cached, add `--offline` to Cargo commands or use `CARGO_NET_OFFLINE=true` for Tauri commands. Offline mode does not install missing dependencies. A sandbox or network failure is an environment constraint; report it and use the available approval mechanism when access is needed.

The ordinary Rust tests use shorter injected timeouts and local HTTP servers. Production timeout tests are explicitly ignored. Each simulated request takes about 30 seconds; each test covers both stalled headers and bodies:

```bash
cargo test --offline --manifest-path src-tauri/Cargo.toml production_ -- --ignored --nocapture
```

These slower checks matter when changing SimpleFIN timeout behavior; they are not required for unrelated edits. Benchmarks are similarly opt-in:

```bash
npm run test:run -- --config tools/benchmarks/vitest.config.ts
```

[Audit evidence](audit-fixes.md) records historical timings and test counts. Those counts are results from that revision, not expectations for the current suite.

`test:coverage` configures Vitest's V8 coverage provider, but `@vitest/coverage-v8` is not in the committed dependencies. It is not a CI check or a guaranteed offline command; provider setup needs a deliberate dependency change.

## Native verification

Use [the native smoke instructions](../tools/native-smoke/README.md) for durable saves, recovery/repair and the dashboard forecast. Both harnesses copy current tracked and untracked, non-ignored working files, inject a fixture-only route and choose a separate app identifier. Production routes and user data are untouched.

Dependencies and the Rust target directory are symlinked to the original workspace. Run one native harness/build at a time; its binary and build cache are shared. Do not clean the target directory from a disposable workspace. Stop dev processes before building a release, and rebuild before installing so a fixture binary/configuration cannot be mistaken for production.

Unit tests mock native APIs. Browser preview and a passing unit suite alone do not verify actual disk acknowledgment, Keychain prompts, tray behavior, notifications or relaunch recovery.

## Release build and installation

For a requested desktop release:

1. Stop native dev/harness processes and finish the relevant checks.
2. Run `npm run tauri:build` in the real repository with its production configuration.
3. Inspect `src-tauri/target/release/bundle/macos/Ledger.app`; DMGs are under `src-tauri/target/release/bundle/dmg/`. The DMG name depends on the configured version and build architecture.
4. If installation was requested, quit the running installed Ledger app, stage a complete copy of the new bundle, retain the old bundle at a unique temporary path, then replace `/Applications/Ledger.app` and relaunch it. Preserve the application-support directory and Keychain.
5. Verify the launched app is the new bundle and the relevant behavior works. Report build/test evidence and any check that could not run.

A frontend-only build produces no `.app`. Tauri's `beforeBuildCommand` already runs `npm run build`, so an extra frontend build or unconditional Cargo clean is unnecessary. If evidence points to stale Rust artifacts, use a targeted clean:

```bash
cargo clean --manifest-path src-tauri/Cargo.toml -p ledger
```

Rebuild with `tauri:build` afterwards. Check the configured `frontendDist`, app identifier and active processes before diagnosing a stale installation. Normal iteration should reuse caches.

Documentation-only work requires checking links, commands and claims against their sources. It does not require rebuilding or replacing the installed application. Commit/push/install actions follow the user's requested scope.
