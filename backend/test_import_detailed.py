print("Importing core.config...")
from core.config import settings
print("Importing core.db...")
from core.db import engine
print("Importing auth_service.models...")
from auth_service.models import User
print("Importing proposal_service.router...")
from proposal_service.router import router
print("Importing app...")
from proposal_service.main import app
print("Done")
