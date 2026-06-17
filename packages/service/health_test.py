import unittest

from fastapi.testclient import TestClient

from packages.service.health import build_health_app


class HealthAppTest(unittest.TestCase):
    """Drives real requests through the ASGI stack."""

    def test_health_ok(self):
        client = TestClient(build_health_app("svc-x"))
        resp = client.get("/health")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"status": "ok", "service": "svc-x"})

    def test_ready_ok(self):
        client = TestClient(build_health_app("svc-x"))
        resp = client.get("/ready")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"status": "ready", "service": "svc-x"})


if __name__ == "__main__":
    unittest.main()
