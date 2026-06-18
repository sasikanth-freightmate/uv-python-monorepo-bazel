import unittest
from unittest import mock

from apps.flow_backend.config import Role, Settings, parse_role


DB_URL = "postgresql+asyncpg://user:pass@localhost:5432/test"
REDIS_URL = "redis://localhost:6379/0"


class SettingsTest(unittest.TestCase):
    @mock.patch.dict(
        "os.environ",
        {"DATABASE_URL": DB_URL, "REDIS_URL": REDIS_URL},
        clear=False,
    )
    def test_defaults(self):
        s = Settings()
        self.assertEqual(s.app_env, "development")
        self.assertEqual(s.log_level, "INFO")
        self.assertEqual(s.health_port, 8080)

    @mock.patch.dict(
        "os.environ",
        {
            "DATABASE_URL": DB_URL,
            "REDIS_URL": REDIS_URL,
            "LOG_LEVEL": "DEBUG",
            "HEALTH_PORT": "9999",
        },
        clear=False,
    )
    def test_env_override(self):
        s = Settings()
        self.assertEqual(s.log_level, "DEBUG")
        self.assertEqual(s.health_port, 9999)

    def test_missing_database_url_raises(self):
        with mock.patch.dict("os.environ", {"REDIS_URL": REDIS_URL}, clear=True):
            with self.assertRaises(Exception):
                Settings()

    def test_missing_redis_url_raises(self):
        with mock.patch.dict("os.environ", {"DATABASE_URL": DB_URL}, clear=True):
            with self.assertRaises(Exception):
                Settings()


class ParseRoleTest(unittest.TestCase):
    def test_each_role_parses(self):
        for role in Role:
            self.assertEqual(parse_role(["--role", role.value]), role)

    def test_unknown_role_rejected(self):
        with self.assertRaises(SystemExit):
            parse_role(["--role", "bogus"])

    def test_role_is_required(self):
        with self.assertRaises(SystemExit):
            parse_role([])


if __name__ == "__main__":
    unittest.main()
