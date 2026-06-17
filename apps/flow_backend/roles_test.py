import unittest

from fastapi.testclient import TestClient

from apps.flow_backend.config import Role
from apps.flow_backend.roles import RUNNERS, api, gateway, get_runner, ingestion, reconciler, worker

_MODULES = {
    Role.API: api,
    Role.WORKER: worker,
    Role.INGESTION: ingestion,
    Role.GATEWAY: gateway,
    Role.RECONCILER: reconciler,
}


class RegistryTest(unittest.TestCase):
    def test_every_role_has_a_runner(self):
        for role in Role:
            self.assertIn(role, RUNNERS)
            self.assertTrue(callable(get_runner(role)))


class RoleAppsTest(unittest.TestCase):
    """Each role's app boots and answers liveness through the real ASGI stack."""

    def test_each_role_serves_health(self):
        for role, module in _MODULES.items():
            client = TestClient(module.build_app())
            resp = client.get("/health")
            self.assertEqual(resp.status_code, 200, role.value)
            self.assertEqual(resp.json(), {"status": "ok", "service": f"flow-backend:{role.value}"})


if __name__ == "__main__":
    unittest.main()
