import os
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from configure import configure


class InstallConfigTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.root = Path(self.folder.name)
        self.uid, self.gid = os.getuid() or 10001, os.getgid() or 10001

    def tearDown(self):
        self.folder.cleanup()

    def create(self, **overrides):
        args = dict(folder=self.root, origin='https://pages.example.com',
                    email='owner@example.com', name='Owner', uid=self.uid, gid=self.gid)
        args.update(overrides)
        with patch('configure.secrets.token_urlsafe', return_value='test-'+'x'*48), patch('configure.secrets.token_hex', return_value='a'*64):
            configure(**args)

    def test_secure_configuration_and_reinstall_protection(self):
        self.create()
        before = (self.root / '.env').read_bytes()
        self.assertEqual((self.root / '.env').stat().st_mode & 0o777, 0o600)
        self.assertTrue((self.root / 'data').is_dir())
        self.assertIn("ADMIN_SETUP_CODE='"+'a'*64+"'", before.decode())
        with self.assertRaises(ValueError):
            self.create()
        self.assertEqual((self.root / '.env').read_bytes(), before)

    def test_existing_data_and_symlinks_are_preserved(self):
        data = self.root / 'data'
        data.mkdir()
        (data / 'existing.db').write_bytes(b'keep')
        with self.assertRaises(ValueError):
            self.create()
        self.assertEqual((data / 'existing.db').read_bytes(), b'keep')
        self.assertFalse((self.root / '.env').exists())
        (data / 'existing.db').unlink()
        data.rmdir()
        data.symlink_to(self.folder.name, target_is_directory=True)
        with self.assertRaises(ValueError):
            self.create()

    def test_invalid_configuration_does_not_create_files(self):
        for override in [{'origin':'http://pages.example.com'}, {'origin':'https://pages.example.com/production/'},
                         {'origin':'https://user:password@pages.example.com'}, {'email':'invalid'},
                         {'name':'Owner\nNAS_UID=0'}, {'uid':0}, {'gid':0}]:
            with self.subTest(override=override), self.assertRaises(ValueError):
                self.create(**override)
            self.assertFalse((self.root / '.env').exists())

    def test_owner_name_can_contain_quotes_and_dollar_signs(self):
        self.create(name="Owner's $HOME #1")
        self.assertIn("ADMIN_NAME='Owner\\'s $HOME #1'", (self.root / '.env').read_text())


if __name__ == '__main__':
    unittest.main()
