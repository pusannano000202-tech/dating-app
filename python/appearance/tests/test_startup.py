"""Regression coverage for local and container service startup."""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

import main as server_module


class TestStartupConfiguration(unittest.TestCase):
    def test_finds_root_env_file_from_local_service_path(self):
        with TemporaryDirectory() as temporary_directory:
            repository_root = Path(temporary_directory) / "repository"
            module_path = repository_root / "python" / "appearance" / "main.py"
            module_path.parent.mkdir(parents=True)
            root_env = repository_root / ".env.local"
            root_env.write_text("AI_SERVER_SECRET=test-secret\n", encoding="utf-8")

            self.assertTrue(hasattr(server_module, "find_root_env_file"))
            self.assertEqual(server_module.find_root_env_file(module_path), root_env)

    def test_container_style_path_without_root_env_is_safe(self):
        with TemporaryDirectory() as temporary_directory:
            module_path = Path(temporary_directory) / "app" / "main.py"
            module_path.parent.mkdir()

            self.assertTrue(hasattr(server_module, "find_root_env_file"))
            self.assertIsNone(server_module.find_root_env_file(module_path))

    def test_compose_healthcheck_uses_image_python_not_curl(self):
        compose_file = Path(__file__).resolve().parents[3] / "docker-compose.yml"
        compose = compose_file.read_text(encoding="utf-8")
        healthcheck = compose.split("healthcheck:", maxsplit=1)[1]

        self.assertIn('test: ["CMD", "python", "-c",', healthcheck)
        self.assertIn("urllib.request.urlopen", healthcheck)
        self.assertNotIn('"curl"', healthcheck)

    def test_runtime_container_includes_anchor_manifest_and_uses_injected_port(self):
        service_root = Path(__file__).resolve().parents[1]
        dockerfile = (service_root / "Dockerfile").read_text(encoding="utf-8")

        self.assertIn("COPY python/appearance/requirements-runtime.txt", dockerfile)
        self.assertIn("COPY data/appearance-calibration-v2/approved-anchors.json", dockerfile)
        self.assertIn("${PORT:-8001}", dockerfile)

    def test_runtime_dependencies_exclude_legacy_pytorch_stack(self):
        service_root = Path(__file__).resolve().parents[1]
        requirements = (service_root / "requirements-runtime.txt").read_text(
            encoding="utf-8"
        )

        self.assertNotIn("torch", requirements.lower())
        self.assertNotIn("torchvision", requirements.lower())
        self.assertIn("fastapi", requirements.lower())
        self.assertIn("openai", requirements.lower())

    def test_compose_builds_the_service_from_repository_root(self):
        compose_file = Path(__file__).resolve().parents[3] / "docker-compose.yml"
        compose = compose_file.read_text(encoding="utf-8")
        build = compose.split("build:", maxsplit=1)[1].split("ports:", maxsplit=1)[0]

        self.assertIn("context: .", build)
        self.assertIn("dockerfile: python/appearance/Dockerfile", build)

    def test_docker_context_only_includes_runtime_source_and_anchor_manifest(self):
        ignore_file = Path(__file__).resolve().parents[3] / ".dockerignore"
        rules = ignore_file.read_text(encoding="utf-8")

        self.assertIn("**", rules.splitlines())
        self.assertIn("!python/appearance/*.py", rules.splitlines())
        self.assertIn("!python/appearance/requirements-runtime.txt", rules.splitlines())
        self.assertIn(
            "!data/appearance-calibration-v2/approved-anchors.json",
            rules.splitlines(),
        )
