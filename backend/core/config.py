from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str
    VERSION: str
    
    # Security
    SECRET_KEY: str
    ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int
    
    # Database
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_SERVER: str
    POSTGRES_PORT: str
    POSTGRES_DB: str
    
    # Redis
    REDIS_HOST: str
    REDIS_PORT: str

    # Vertex AI (Global)
    VERTEX_PROJECT_ID: str = ""
    VERTEX_LOCATION: str = "us-central1"
    VERTEX_MODEL: str = "gemini-2.0-flash"
    VERTEX_KEY_PATH: str = "vertex-key.json"
    
    # Proposal Service Storage (Outside backend to prevent hot-reload loops)
    PROPOSAL_STUDIO_DATA_DIR: str = "../proposal_studio_data"
    
    # Enterprise DOCX editor integration (OnlyOffice/Collabora compatible scaffold)
    DOCX_EDITOR_ENABLED: bool = False
    DOCX_EDITOR_URL: str = ""  # e.g. https://docs.example.com/web-apps/apps/documenteditor/main/index.html
    DOCX_EDITOR_PUBLIC_BASE_URL: str = ""  # public base URL of this app, e.g. https://mspeventwin2.westus.cloudapp.azure.com
    DOCX_EDITOR_JWT_SECRET: str = ""

    # BRD capture/description performance tuning
    BRD_MAX_CAPTURE_FRAMES: int = 36
    BRD_MIN_CAPTURE_INTERVAL_SEC: float = 1.5
    BRD_LLM_FRAME_CONCURRENCY: int = 6
    BRD_LLM_MAX_OUTPUT_TOKENS: int = 1024

    @property
    def async_database_url(self) -> str:
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=True)

settings = Settings()
