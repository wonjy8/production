"""Run only inside the NAS container terminal. Existing accounts are located by the stored bootstrap user ID."""
import argparse,getpass,sys
import server
from local_auth import bootstrap_admin,hash_password,bootstrap_identity

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--reset-password',action='store_true',help='Reset the original owner password using local NAS access. MFA is preserved.');args=parser.parse_args()
    with server.database() as conn:
        exists=conn.execute('SELECT 1 FROM app_bootstrap').fetchone()
    if exists and not args.reset_password:
        print('초기 계정이 이미 있습니다. 기존 계정으로 로그인하세요.');return
    if not args.reset_password:bootstrap_identity()
    password=getpass.getpass('새 비밀번호 (8자 이상, 숫자·특수문자): ');confirm=getpass.getpass('비밀번호 다시 입력: ')
    if password!=confirm:raise ValueError('비밀번호가 일치하지 않습니다')
    if args.reset_password:
        encoded=hash_password(password)
        with server.write_lock,server.database() as conn:
            target=conn.execute('SELECT u.id FROM app_users u JOIN app_bootstrap b ON b.user_id=u.id WHERE b.id=1',()).fetchone()
            if not target:raise ValueError('초기 계정이 없습니다')
            conn.execute('UPDATE local_credentials SET password_hash=? WHERE user_id=?',(encoded,target[0]));conn.execute('DELETE FROM local_sessions WHERE user_id=?',(target[0],));conn.execute('INSERT INTO access_audit(user_id,action,target,created_at) VALUES(?,?,?,?)',(target[0],'offline-password-reset',target[0],server.now()))
        print('비밀번호를 변경했습니다. 기존 2단계 인증은 유지됩니다.')
    else:
        bootstrap_admin(server.database,server.write_lock,server.save_workspace,server.now,password)
        print('최고관리자를 생성했습니다. 앱에서 로그인 후 인증 앱을 등록하세요.')
if __name__=='__main__':
    try:main()
    except (ValueError,server.HTTPException) as e:print(getattr(e,'detail',str(e)),file=sys.stderr);sys.exit(1)
