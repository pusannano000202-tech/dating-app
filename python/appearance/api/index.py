"""Vercel Python Function entrypoint for the appearance service."""

# The service directory must be inserted before importing the ASGI app.
# ruff: noqa: E402,I001

import sys
from pathlib import Path


SERVICE_ROOT = Path(__file__).resolve().parent.parent
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from main import app  # noqa: F401
