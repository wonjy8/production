"""Prepare a new NAS installation; never overwrite configuration or existing data."""
import argparse
import os
import re
import secrets
from pathlib import Path
from urllib.parse import urlsplit


def configure(folder, origin, email, name, uid, gid, owner_uid=None, owner_gid=None):
    folder = Path(folder)
    parsed = urlsplit(origin)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.path not in ('', '/') or parsed.query or parsed.fragment:
        raise ValueError('Pages 주소는 경로 없이 HTTPS 원본 주소만 입력하세요.')
    parsed.port  # Validate the optional port.
    origin = 'https://' + parsed.netloc
    email, name = email.strip().lower(), name.strip()
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email) or len(email) > 254 or not name or len(name) > 100:
        raise ValueError('유효한 관리자 이메일과 이름(100자 이하)이 필요합니다.')
    if any(c in origin + email + name for c in ('\r', '\n', '\0')):
        raise ValueError('설정 값에는 줄바꿈을 넣을 수 없습니다.')
    if uid <= 0 or gid <= 0:
        raise ValueError('컨테이너 UID/GID는 0보다 큰 값이어야 합니다.')
    config, data = folder / '.env', folder / 'data'
    if config.exists() or config.is_symlink():
        raise ValueError('.env가 이미 있습니다. 새 설치를 중단합니다. 기존 서버에는 update.sh를 사용하세요.')
    if data.is_symlink() or (data.exists() and (not data.is_dir() or any(data.iterdir()))):
        raise ValueError('기존 data를 발견했습니다. 빈 새 설치 폴더를 사용하세요.')
    if os.geteuid() != 0 and (uid != os.getuid() or gid != os.getgid()):
        raise ValueError('다른 UID/GID의 데이터 폴더를 준비하려면 Docker 설치 스크립트를 사용하세요.')
    def quoted(value):
        return "'" + value.replace('\\', '\\\\').replace("'", "\\'") + "'"
    settings = {
        'NAS_UID': str(uid), 'NAS_GID': str(gid),
        'NAS_API_TOKEN': secrets.token_urlsafe(48), 'PAGES_ORIGINS': origin,
        'ADMIN_EMAIL': email, 'ADMIN_NAME': name,
        'ADMIN_MEMBER_ID': '', 'ADMIN_SETUP_CODE': secrets.token_hex(32),
    }
    data.mkdir(mode=0o700, exist_ok=True)
    if os.geteuid() == 0:
        os.chown(data, uid, gid)
    descriptor = os.open(config, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w', encoding='utf-8') as target:
        for key, value in settings.items():
            target.write(key + '=' + quoted(value) + '\n')
    if os.geteuid() == 0 and owner_uid is not None and owner_gid is not None:
        os.chown(config, owner_uid, owner_gid)
    print('.env 및 data 폴더를 준비했습니다. 첫 관리자 설정 코드는 NAS의 .env에서 확인하세요.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', default='.')
    parser.add_argument('--origin', required=True, help='Example: https://wonjy8.github.io')
    parser.add_argument('--admin-email', required=True)
    parser.add_argument('--admin-name', required=True)
    parser.add_argument('--uid', type=int, default=os.getuid() or 10001)
    parser.add_argument('--gid', type=int, default=os.getgid() or 10001)
    parser.add_argument('--owner-uid', type=int)
    parser.add_argument('--owner-gid', type=int)
    args = parser.parse_args()
    try:
        configure(args.directory, args.origin, args.admin_email, args.admin_name,
                  args.uid, args.gid, args.owner_uid, args.owner_gid)
    except (ValueError, OSError) as error:
        parser.exit(1, str(error) + '\n')


if __name__ == '__main__':
    main()
