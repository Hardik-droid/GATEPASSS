"""Vercel entrypoint for server-authoritative ticket validation."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.main import app  # noqa: E402

__all__ = ["app"]
