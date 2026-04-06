import httpx
import asyncio

async def test_422():
    url = "http://localhost:8002/api/proposal/generate"
    # Note: RequireRole requires token. I'll skip it by calling the app directly if I can, 
    # but I'll just try with a mock but right data types.
    payload = {
        "discovery_file": "test.xlsx",
        "use_cases": [],
        "work_days": 1,
        "total_bots": 18,
        "cycle_time": "15.5", # String float - this should fail if backend is int
        "sys_hours": 16.0
    }
    async with httpx.AsyncClient() as client:
        # We might get 401/403 but 422 happens before auth if pydantic fails on body?
        # No, FastAPI auth dependencies run first.
        # But if I use valid token ...
        pass

if __name__ == "__main__":
    # Actually, I'll just look at router.py again.
    import pydantic
    from typing import List, Dict, Any, Optional
    
    class GenerateRequest(pydantic.BaseModel):
        discovery_file: str
        use_cases: List[Dict[str, Any]]
        work_days: int = 1
        total_bots: int = 18
        cycle_time: int = 5
        num_cpu: int = 3
        num_cores: int = 6
        sys_hours: float = 16.0
        hw_data: Optional[Dict[str, Any]] = None

    try:
        GenerateRequest(discovery_file="test", use_cases=[], cycle_time="15.5")
        print("Success")
    except Exception as e:
        print(f"Failed: {e}")
