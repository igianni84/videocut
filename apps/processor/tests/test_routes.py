"""Tests for FastAPI routes in src.api.routes.

Uses httpx AsyncClient with ASGITransport, matching the existing test_health.py pattern.
Mocks Redis/arq pool and API key verification.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from src.main import app


# ── POST /process ──────────────────────────────────────────────────


class TestProcessEndpoint:
    @pytest.mark.asyncio
    async def test_valid_request_enqueues_job(self):
        """POST /process with valid API key -> 200, enqueue called."""
        mock_pool = AsyncMock()
        mock_pool.enqueue_job = AsyncMock(
            return_value=MagicMock(job_id="arq-123")
        )

        with patch("src.api.dependencies.settings") as mock_settings:
            mock_settings.api_key = "test-key"

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                # Inject mock redis pool into app state
                app.state.redis_pool = mock_pool

                response = await client.post(
                    "/process",
                    json={
                        "job_id": "job-abc",
                        "video_storage_path": "user123/video.mp4",
                    },
                    headers={"x-api-key": "test-key"},
                )

        assert response.status_code == 200
        data = response.json()
        assert data["job_id"] == "job-abc"
        assert data["status"] == "queued"
        mock_pool.enqueue_job.assert_called_once_with(
            "process_video_task",
            "job-abc",
            "user123/video.mp4",
            {"silence_threshold_ms": 300, "min_breath_pause_ms": 50},
        )

    @pytest.mark.asyncio
    async def test_custom_options_forwarded(self):
        """Custom processing options are correctly forwarded."""
        mock_pool = AsyncMock()
        mock_pool.enqueue_job = AsyncMock(
            return_value=MagicMock(job_id="arq-456")
        )

        with patch("src.api.dependencies.settings") as mock_settings:
            mock_settings.api_key = "test-key"

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                app.state.redis_pool = mock_pool

                response = await client.post(
                    "/process",
                    json={
                        "job_id": "job-xyz",
                        "video_storage_path": "user/vid.mp4",
                        "options": {
                            "silence_threshold_ms": 500,
                            "min_breath_pause_ms": 100,
                        },
                    },
                    headers={"x-api-key": "test-key"},
                )

        assert response.status_code == 200
        mock_pool.enqueue_job.assert_called_once_with(
            "process_video_task",
            "job-xyz",
            "user/vid.mp4",
            {"silence_threshold_ms": 500, "min_breath_pause_ms": 100},
        )

    @pytest.mark.asyncio
    async def test_missing_api_key_returns_422(self):
        """POST /process without X-Api-Key header -> 422 (validation error)."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/process",
                json={
                    "job_id": "job-1",
                    "video_storage_path": "user/video.mp4",
                },
            )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_invalid_api_key_returns_401(self):
        """POST /process with wrong API key -> 401."""
        with patch("src.api.dependencies.settings") as mock_settings:
            mock_settings.api_key = "correct-key"

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/process",
                    json={
                        "job_id": "job-1",
                        "video_storage_path": "user/video.mp4",
                    },
                    headers={"x-api-key": "wrong-key"},
                )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_missing_body_fields_returns_422(self):
        """POST /process with incomplete body -> 422."""
        with patch("src.api.dependencies.settings") as mock_settings:
            mock_settings.api_key = "test-key"

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/process",
                    json={"job_id": "job-1"},  # missing video_storage_path
                    headers={"x-api-key": "test-key"},
                )

        assert response.status_code == 422


# ── GET /health ────────────────────────────────────────────────────


class TestHealthEndpoint:
    @pytest.mark.asyncio
    async def test_redis_connected(self):
        """GET /health with working Redis -> status ok."""
        mock_pool = AsyncMock()
        mock_pool.ping = AsyncMock(return_value=True)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            app.state.redis_pool = mock_pool
            response = await client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["redis"] == "connected"

    @pytest.mark.asyncio
    async def test_no_redis_pool(self):
        """GET /health with no Redis pool -> status degraded."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Remove redis_pool from state (simulate not yet connected)
            if hasattr(app.state, "redis_pool"):
                delattr(app.state, "redis_pool")
            response = await client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "degraded"
        assert data["redis"] == "disconnected"

    @pytest.mark.asyncio
    async def test_redis_ping_fails(self):
        """GET /health with Redis that raises on ping -> status degraded."""
        mock_pool = AsyncMock()
        mock_pool.ping = AsyncMock(side_effect=ConnectionError("refused"))

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            app.state.redis_pool = mock_pool
            response = await client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "degraded"
        assert data["redis"] == "disconnected"
