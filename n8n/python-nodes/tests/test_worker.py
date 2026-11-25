"""Smoke tests for the worker's pure logic (no network, no models)."""

from __future__ import annotations

import numpy as np
import pytest

from signallab_worker.downloader import classify_ytdlp_error
from signallab_worker.embedder import HashingEmbedder
from signallab_worker.errors import ErrorCode


@pytest.mark.parametrize(
    "msg, code",
    [
        ("Requested content is not available, rate-limit reached or login required",
         ErrorCode.PRIVATE_OR_LOGIN_REQUIRED),
        ("HTTP Error 429: Too Many Requests", ErrorCode.RATE_LIMITED),
        ("HTTP Error 404: Not Found", ErrorCode.NOT_FOUND),
        ("Unable to extract shared data", ErrorCode.DOWNLOAD_FAILED),
    ],
)
def test_classify_ytdlp_error(msg, code):
    assert classify_ytdlp_error(msg) == code


async def test_hashing_embedder_is_normalised_and_deterministic():
    e = HashingEmbedder()
    a, b = await e.embed(["vector databases", "vector databases"])
    assert a.shape == (384,)
    assert np.isclose(np.linalg.norm(a), 1.0)
    assert np.allclose(a, b)
