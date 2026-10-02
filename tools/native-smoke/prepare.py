"""Prepare a disposable native app with the current working files and an automatic smoke route."""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import uuid

root = Path(__file__).resolve().parents[2]
workspace = Path(tempfile.mkdtemp(prefix='ledger-native-smoke-', dir='/private/tmp'))
identifier = 'app.ledger.audit' + uuid.uuid4().hex[:12]
files = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=root).decode().split('\0')
for filename in files:
    source = root / filename
    if not filename or not source.is_file():
        continue
    destination = workspace / filename
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
(workspace / 'node_modules').symlink_to(root / 'node_modules', target_is_directory=True)
(workspace / 'src-tauri' / 'target').symlink_to(root / 'src-tauri' / 'target', target_is_directory=True)
route = workspace / 'src/routes/audit-smoke'
route.mkdir(parents=True)
shutil.copy2(root / 'tools/native-smoke/page.svelte', route / '+page.svelte')
layout = workspace / 'src/routes/+layout.svelte'
layout.write_text(layout.read_text().replace("$page.url.pathname.startsWith('/quick-add')", "$page.url.pathname.startsWith('/quick-add') || $page.url.pathname.startsWith('/audit-smoke')"))
config = workspace / 'smoke-config.json'
config.write_text(json.dumps({'identifier': identifier, 'productName': 'Ledger Audit Smoke', 'app': {'windows': [{'label': 'main', 'title': 'Ledger Audit Smoke', 'url': 'audit-smoke', 'width': 800, 'height': 600}]}}))
manifest = {'workspace': str(workspace), 'config': str(config), 'identifier': identifier, 'dataDir': str(Path.home() / 'Library/Application Support' / identifier), 'binary': str(root / 'src-tauri/target/debug/ledger')}
Path('/private/tmp/ledger-native-smoke-manifest.json').write_text(json.dumps(manifest, indent=2))
print(json.dumps(manifest, indent=2))
