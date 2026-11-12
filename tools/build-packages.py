"""Build the self-contained extension ZIP; no node_modules or local credentials."""
from pathlib import Path
import zipfile
import json
ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
DIST.mkdir(exist_ok=True)
def archive(name, files, base):
    with zipfile.ZipFile(DIST / name, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as out:
        for file in sorted(files):
            relative = file.relative_to(base)
            if any(part in {'node_modules', '.git', '__pycache__'} for part in relative.parts) or file.name in {'config.local.json', '.env'}:
                raise ValueError('Private/dependency file in package')
            content = file.read_bytes()
            if file.suffix == '.cmd': content = content.replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')
            entry = zipfile.ZipInfo(str(relative).replace('\\','/'), date_time=(2026,11,12,0,0,0))
            entry.compress_type = zipfile.ZIP_DEFLATED; entry.external_attr = 0o100644 << 16
            out.writestr(entry, content)
    with zipfile.ZipFile(DIST / name) as check:
        assert check.testzip() is None
        print(name, len(check.namelist()), 'files,', (DIST / name).stat().st_size, 'bytes')
files = [ROOT / 'manifest.json'] + [ROOT / name for name in ['README.md','GUIDA_UTENTE.md','GUIDA_UTENTE.pdf','SICUREZZA.md','DOCUMENTATION.md','CHANGELOG.md','package.json','package-lock.json']]
for directory in ['assets','esempi','tests','src']:
    files.extend(p for p in (ROOT / directory).rglob('*') if p.is_file())
files.append(ROOT / 'tools/build-extension.mjs')
archive('sfmc-ui-fixer-multi-bu-diagnostica.zip', files, ROOT)
with zipfile.ZipFile(DIST / 'sfmc-ui-fixer-multi-bu-diagnostica.zip') as check:
    assert json.loads(check.read('manifest.json'))['version'] == '1.1.39'
