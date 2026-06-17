import logging
import unittest

from packages.service.logging_setup import configure_logging


class ConfigureLoggingTest(unittest.TestCase):
    def test_sets_root_level(self):
        configure_logging("DEBUG")
        self.assertEqual(logging.getLogger().level, logging.DEBUG)
        configure_logging("WARNING")
        self.assertEqual(logging.getLogger().level, logging.WARNING)

    def test_level_is_case_insensitive(self):
        configure_logging("info")
        self.assertEqual(logging.getLogger().level, logging.INFO)


if __name__ == "__main__":
    unittest.main()
