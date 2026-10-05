# Isolated native smoke checks

Run preparation commands from the repository root on macOS after installing npm dependencies. The harnesses use synthetic fixtures, a disposable workspace and a unique app identifier/data directory. They do not read or modify the production Ledger financial files. The Python helper uses only the standard library.

Both harnesses symlink `node_modules` and `src-tauri/target` to the real workspace, so the Rust binary/cache are shared. Run one native harness/build at a time, quit between phases, and do not clean the shared target directory from a disposable workspace. These fixtures do not test live SimpleFIN/Keychain linking.

## Durable storage and historical repair

```bash
python3 tools/native-smoke/prepare.py
```

This copies the current tracked and untracked, non-ignored working files under `/private/tmp`. Read `/private/tmp/ledger-native-smoke-manifest.json` for the workspace, configuration, app identifier, fixture directory and binary path.

From that workspace, build with `CARGO_NET_OFFLINE=true npm run tauri -- build --debug --no-bundle --config smoke-config.json`. Launch the manifest's binary three times, quitting between phases. The injected smoke route runs automatically and writes `smoke-result.json` under the separate app data directory. The third phase must report `ok: true`, `stage: 3`, and `complete: true`.

Phases verify native durable saves, invalid date rejection, contribution transfers, saved-record relaunch, selected damaged-file correction, both original snapshot readbacks, repaired-file restart, and strict backup restore. Fixtures and verified originals remain available for inspection. This harness adds no route to the production source tree.

## Dashboard forecast and relaunch

```bash
node tools/native-smoke/prepare-planning.mjs
```

This writes `/private/tmp/ledger-planning-dev-manifest.json` with a fresh disposable workspace and separate data directory. In that workspace, start Vite and Tauri in separate terminals:

```bash
npm run dev -- --host 127.0.0.1 --port 5175
```

```bash
CARGO_NET_OFFLINE=true npm run tauri -- dev --no-watch --config planning-dev.json
```

The custom Tauri config disables `beforeDevCommand` because Vite is already running. Offline mode requires cached Cargo dependencies; it is not a bootstrap step.

The native dev route mounts the actual Dashboard and sidebar, verifies early rent, a variable bill override, future savings, a collapsed forecast explanation, removal of Planning navigation, the familiar entry form, and strict disk validation. Read `planning-result.json` in the manifest's separate data directory; it must report `ok: true`. Restart Tauri dev with the same command; the result must also report `restarted: true`. Stop both dev processes before the production build. The harness adds no route to production and does not touch the user's Ledger data.

## After verification

Leave fixture results/originals available for inspection. Rebuild from the real repository with the production config before installing a release. Do not install the shared debug binary or a fixture-config bundle as Ledger. See [development.md](../../docs/development.md) for checks and release workflow.
