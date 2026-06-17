import unittest

from packages.service.health import build_health_app
from packages.service.runner import build_server


class BuildServerTest(unittest.TestCase):
    def test_applies_host_port_and_level(self):
        server = build_server(
            build_health_app("svc"), host="127.0.0.1", port=9123, log_level="WARNING"
        )
        self.assertEqual(server.config.host, "127.0.0.1")
        self.assertEqual(server.config.port, 9123)


if __name__ == "__main__":
    unittest.main()
