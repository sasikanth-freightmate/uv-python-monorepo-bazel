import unittest
from unittest import mock

from packages.service.settings import BaseServiceSettings


class BaseServiceSettingsTest(unittest.TestCase):
    def test_defaults(self):
        s = BaseServiceSettings()
        self.assertEqual(s.app_env, "development")
        self.assertEqual(s.log_level, "INFO")
        self.assertEqual(s.health_host, "0.0.0.0")
        self.assertEqual(s.health_port, 8080)

    @mock.patch.dict("os.environ", {"LOG_LEVEL": "DEBUG", "HEALTH_PORT": "9001"}, clear=False)
    def test_env_override(self):
        s = BaseServiceSettings()
        self.assertEqual(s.log_level, "DEBUG")
        self.assertEqual(s.health_port, 9001)


if __name__ == "__main__":
    unittest.main()
