import sys
print("Python:", sys.version)
print("Importing config...")
from core.config import settings
print("Importing db...")
from core.db import engine
print("Importing models...")
from auth_service.models import User
print("Importing openpyxl...")
import openpyxl
print("Importing vertexai...")
import vertexai
print("Importing vertexai.generative_models...")
from vertexai.generative_models import GenerativeModel
print("Importing router...")
from proposal_service.router import router
print("Importing app...")
from proposal_service.main import app
print("Done")
