"""Create a code-only NAS update. Never bundle a database, .env or account key."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
output = root / 'dist' / 'production-nas-update.zip'
output.parent.mkdir(parents=True, exist_ok=True)
files = ['server.py', 'browser_gateway.py', 'access.py', 'accounts.py', 'local_auth.py',
         'setup_admin.py', 'schema.sql', 'Dockerfile', 'compose.yaml', '.env.example',
         'requirements.txt', 'README.md', 'update.sh']
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(root / 'nas' / name, name)
print(output)
