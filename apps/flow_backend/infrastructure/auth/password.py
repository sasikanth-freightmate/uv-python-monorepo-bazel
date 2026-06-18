"""Password hashing — stdlib scrypt, no third-party deps.

Stored form: ``scrypt$<salt_b64>$<hash_b64>``. Salt is per-password; verify is
constant-time.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os

_N = 2**14
_R = 8
_P = 1
_DKLEN = 32


class PasswordHasher:
    def hash(self, password: str) -> str:
        salt = os.urandom(16)
        derived = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=_DKLEN)
        return f"scrypt${base64.b64encode(salt).decode()}${base64.b64encode(derived).decode()}"

    def verify(self, password: str, encoded: str) -> bool:
        try:
            scheme, salt_b64, hash_b64 = encoded.split("$")
            if scheme != "scrypt":
                return False
            salt = base64.b64decode(salt_b64)
            expected = base64.b64decode(hash_b64)
        except (ValueError, base64.binascii.Error):
            return False
        derived = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=len(expected))
        return hmac.compare_digest(derived, expected)
