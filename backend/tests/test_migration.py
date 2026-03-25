import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock
from migration_service.main import app

client = TestClient(app)

# Override dependencies if necessary (like get_db and RequireRole)
from core.db import get_db
from core.deps import RequireRole

async def override_get_db():
    class MockSession:
        async def execute(self, *args, **kwargs):
            class MockResult:
                def scalars(self):
                    class MockScalars:
                        def first(self):
                            return None
                    return MockScalars()
            return MockResult()
        async def commit(self): pass
        async def rollback(self): pass
        def add(self, *args, **kwargs): pass
    yield MockSession()

def override_require_role(*args, **kwargs):
    def dependency():
        class MockUser:
            email = "admin@autoedge.com"
        return MockUser()
    return dependency

app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[RequireRole] = override_require_role

def test_uipath_upload_invalid_extension():
    files = {'files': ('test.exe', b'fake data', 'application/x-msdownload')}
    response = client.post("/api/migration/uipath/analyze", files=files)
    assert response.status_code == 400
    assert "unsupported extension" in response.json()["detail"]

def test_migration_large_file_limit():
    content = b"a" * (16 * 1024 * 1024)  # 16 MB
    files = {'files': ('test.xaml', content, 'application/xml')}
    response = client.post("/api/migration/uipath/analyze", files=files)
    assert response.status_code == 400
    assert "exceeds 15MB limit" in response.json()["detail"]

@patch("migration_service.router.call_llm", new_callable=AsyncMock)
def test_uipath_valid_file_caching_simulation(mock_call_llm):
    mock_call_llm.return_value = '{"nodes": []}'
    files = {'files': ('test.xaml', b'<Activity></Activity>', 'application/xml')}
    response = client.post("/api/migration/uipath/analyze", files=files)
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["fileName"] == "test.xaml"
    assert data["chunks"] == 1
    # Check if mock was called once since cache was missed
    mock_call_llm.assert_called_once()
