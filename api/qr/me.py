"""Vercel Python Function serving GET /api/qr/me.

The file path maps 1:1 onto the public route, so the FastAPI app is invoked
with exactly the path it declares (`/api/qr/me`). Routing the API through a
`vercel.json` rewrite instead would leave it ambiguous whether the function
observes the original or the rewritten path; filesystem routing makes the two
identical and removes the question.
"""

import sys
from pathlib import Path

# `backend` is a top-level package at the repo root, which is not implicitly on
# sys.path when the entrypoint lives two directories down.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.main import app  # noqa: E402

__all__ = ["app"]
