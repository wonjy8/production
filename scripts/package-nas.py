"""Create shareable install/update packages. Never include .env, databases or account keys."""
import argparse
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output-dir', type=Path, default=root / 'dist')
args = parser.parse_args()
args.output_dir.mkdir(parents=True, exist_ok=True)
files = ['UPDATE-0.0.12.md', 'UPDATE-0.0.11.md', 'UPDATE-0.0.6.md', 'resources.py', 'server.py', 'browser_gateway.py', 'access.py', 'accounts.py', 'local_auth.py',
         'setup_admin.py', 'schema.sql', 'Dockerfile', 'compose.yaml', '.dockerignore', '.env.example',
         'requirements.txt', 'install.sh', 'configure.py', 'update.sh']
for kind in ('install', 'update'):
    output = args.output_dir / ('production-nas-' + kind + '.zip')
    with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
        for name in files:
            archive.write(root / 'nas' / name, name)
        archive.write(root / 'nas' / ('INSTALL.md' if kind == 'install' else 'README.md'), 'README.md')
        if kind == 'update':
            archive.write(root / 'nas' / 'INSTALL.md', 'INSTALL.md')
        else:
            archive.write(root / 'nas' / 'README.md', 'OPERATIONS.md')
            archive.write(root / 'nas' / 'INSTALL.md', 'INSTALL.md')
    print(output)
