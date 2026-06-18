"""Unit tests for local auth primitives (ADR-0017).

Pure — no network, no DB. Covers password hashing and session-token issue/verify.
"""

import datetime
import unittest
from types import SimpleNamespace

import jwt

from apps.flow_backend.api.auth.dependencies import SESSION_COOKIE, _extract_token
from apps.flow_backend.domain.identity.exceptions import AuthenticationError
from apps.flow_backend.infrastructure.auth.password import PasswordHasher
from apps.flow_backend.infrastructure.auth.token_service import TokenService

SECRET = "unit-test-secret"


def _fake_request(cookies: dict | None = None, headers: dict | None = None) -> SimpleNamespace:
    # _extract_token only touches .cookies.get() and .headers.get().
    return SimpleNamespace(cookies=cookies or {}, headers=headers or {})


class ExtractTokenTest(unittest.TestCase):
    def test_cookie_is_preferred_over_header(self) -> None:
        req = _fake_request(
            cookies={SESSION_COOKIE: "cookie-tok"},
            headers={"authorization": "Bearer header-tok"},
        )
        self.assertEqual(_extract_token(req), "cookie-tok")

    def test_falls_back_to_authorization_header(self) -> None:
        req = _fake_request(headers={"authorization": "Bearer header-tok"})
        self.assertEqual(_extract_token(req), "header-tok")

    def test_missing_both_raises(self) -> None:
        with self.assertRaises(AuthenticationError):
            _extract_token(_fake_request())

    def test_malformed_authorization_raises(self) -> None:
        with self.assertRaises(AuthenticationError):
            _extract_token(_fake_request(headers={"authorization": "Basic xyz"}))


class PasswordHasherTest(unittest.TestCase):
    def setUp(self) -> None:
        self.hasher = PasswordHasher()

    def test_hash_then_verify_roundtrips(self) -> None:
        encoded = self.hasher.hash("s3cret-pw")
        self.assertTrue(self.hasher.verify("s3cret-pw", encoded))

    def test_wrong_password_rejected(self) -> None:
        encoded = self.hasher.hash("s3cret-pw")
        self.assertFalse(self.hasher.verify("not-it", encoded))

    def test_salt_makes_hashes_unique(self) -> None:
        self.assertNotEqual(self.hasher.hash("same"), self.hasher.hash("same"))

    def test_malformed_encoding_rejected(self) -> None:
        self.assertFalse(self.hasher.verify("pw", "garbage"))


class TokenServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tokens = TokenService(secret=SECRET, ttl_seconds=3600)

    def test_issue_then_verify_roundtrips(self) -> None:
        token = self.tokens.issue("user-123", "a@b.com")
        claims = self.tokens.verify(token)
        self.assertEqual(claims.sub, "user-123")
        self.assertEqual(claims.email, "a@b.com")

    def test_wrong_secret_rejected(self) -> None:
        token = self.tokens.issue("user-123", "a@b.com")
        with self.assertRaises(AuthenticationError):
            TokenService(secret="other", ttl_seconds=3600).verify(token)

    def test_expired_token_rejected(self) -> None:
        token = TokenService(secret=SECRET, ttl_seconds=-1).issue("user-123", "a@b.com")
        with self.assertRaises(AuthenticationError):
            self.tokens.verify(token)

    def test_tampered_token_rejected(self) -> None:
        with self.assertRaises(AuthenticationError):
            self.tokens.verify("not-a-jwt")

    def test_missing_sub_rejected(self) -> None:
        now = datetime.datetime.now(datetime.timezone.utc)
        forged = jwt.encode(
            {"exp": now + datetime.timedelta(hours=1)}, SECRET, algorithm="HS256"
        )
        with self.assertRaises(AuthenticationError):
            self.tokens.verify(forged)


if __name__ == "__main__":
    unittest.main()
