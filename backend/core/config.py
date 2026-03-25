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
    
    # Automation Service Storage (Outside backend to prevent hot-reload loops)
    AE_STUDIO_DATA_DIR: str = "../ae_studio_data"
    AI_STUDIO_DOWNLOADS_DIR: str = "../ae_studio_data/downloads"
    AI_STUDIO_KB_FOLDER: str = "../ae_studio_data/knowledge"
    AI_STUDIO_SYSTEM_PROMPT_PATH: str = "../ae_studio_data/knowledge/prompt.txt"
    AI_STUDIO_SCRIPTS_DIR: str = "../ae_studio_data/scripts"
    AI_STUDIO_CARD_HELPER_DIR: str = "../ae_studio_data/card_helpers"
    AI_STUDIO_TEMPLATES_DIR: str = "../ae_studio_data/templates"
    AI_STUDIO_HOOKS_DIR: str = "../ae_studio_data/hooks"

    @property
    def async_database_url(self) -> str:
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=True)

settings = Settings()
