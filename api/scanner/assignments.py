"""Vercel entrypoint for authenticated mobile scanner assignments."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.main import app  # noqa: E402

__all__ = ["app"]
