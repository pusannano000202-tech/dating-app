"""pytest 공용 설정 — 환경변수 초기화"""
import os
import pytest


@pytest.fixture(autouse=True)
def mock_env(monkeypatch):
    """모든 테스트에 더미 환경변수 주입 (실제 Supabase 호출 방지)"""
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "test-service-key")
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:3000")
