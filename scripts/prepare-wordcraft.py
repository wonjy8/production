"""Install the pinned official WordCraft web release without a Rust build."""
import hashlib
import json
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
source = json.loads((root / 'third_party/wordcraft/source.json').read_text())
cache = root / '.cache/wordcraft'
cache.mkdir(parents=True, exist_ok=True)
archive = cache / ('wordcraft-web-' + source['version'] + '.zip')
if not archive.exists():
    temporary = archive.with_suffix('.download')
    with urllib.request.urlopen(source['url'], timeout=60) as response, temporary.open('wb') as target:
        shutil.copyfileobj(response, target)
    temporary.replace(archive)
if hashlib.sha256(archive.read_bytes()).hexdigest() != source['sha256']:
    archive.unlink()
    raise RuntimeError('WordCraft release checksum mismatch; refusing to install')
output = Path(sys.argv[1])
output.mkdir(parents=True, exist_ok=True)
prefix = 'wordcraft-web-' + source['version'] + '/'
with zipfile.ZipFile(archive) as package:
    for item in package.infolist():
        if item.is_dir():
            continue
        if not item.filename.startswith(prefix):
            raise RuntimeError('Unexpected WordCraft archive path')
        relative = Path(item.filename[len(prefix):])
        if relative.is_absolute() or '..' in relative.parts:
            raise RuntimeError('Unsafe WordCraft archive path')
        target = output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        with package.open(item) as data, target.open('wb') as file:
            shutil.copyfileobj(data, file)
for notice in (root / 'third_party/wordcraft').iterdir():
    if notice.is_file():
        shutil.copy2(notice, output / notice.name)
print('WordCraft ' + source['version'] + ': official web release verified and installed')
