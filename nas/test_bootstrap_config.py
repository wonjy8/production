import os
import unittest
from unittest.mock import patch
from fastapi import HTTPException
from local_auth import bootstrap_identity


class BootstrapConfigTest(unittest.TestCase):
    def test_identity_requires_explicit_private_configuration(self):
        for email, name in [('', ''), ('bad', 'Example'), ('admin@example.com', '')]:
            with patch.dict(os.environ, {'ADMIN_EMAIL':email, 'ADMIN_NAME':name}):
                with self.assertRaises(HTTPException):bootstrap_identity()
        with patch.dict(os.environ, {'ADMIN_EMAIL':' Admin@Example.com ', 'ADMIN_NAME':' Example '}):
            self.assertEqual(bootstrap_identity(), ('admin@example.com', 'Example'))
