"""The Vercel Python Function must answer at exactly the path its file implies.

`api/qr/me.py` is routed by Vercel's filesystem, so the public URL is
`/api/qr/me`. If the FastAPI router prefix and the file path ever drift apart,
the deployed endpoint 404s while every local test still passes — which is
precisely how the QR card broke in production before.
"""

import importlib.util
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ENTRYPOINT = Path(__file__).resolve().parents[1] / "api" / "qr" / "me.py"


@pytest.fixture(scope="module")
def client() -> TestClient:
    spec = importlib.util.spec_from_file_location("vercel_qr_me", ENTRYPOINT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return TestClient(module.app)


def test_entrypoint_serves_its_own_filesystem_path(client: TestClient) -> None:
    # 401 (not 404) proves the route matched and only the bearer check rejected it.
    assert client.get("/api/qr/me").status_code == 401


def test_unknown_api_path_still_404s(client: TestClient) -> None:
    assert client.get("/api/qr/nope").status_code == 404
