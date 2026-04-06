import os
from proposal_service.router import DATA_ROOT, UPLOAD_DIR, OUTPUT_DIR
print(f"DATA_ROOT: {DATA_ROOT}")
print(f"UPLOAD_DIR: {UPLOAD_DIR}")
print(f"OUTPUT_DIR: {OUTPUT_DIR}")
print(f"Exists: {os.path.exists(DATA_ROOT)}")
