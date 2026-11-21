from pathlib import Path

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "BookWise API"
    ENVIRONMENT: str = "development"
    DATABASE_URL: str = Field(..., min_length=1)
    AUTH_SECRET_KEY: str = "development-only-change-me-32-characters"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=10080, gt=0)
    CORS_ALLOW_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"
    ADMIN_UPLOADS_ENABLED: bool = False
    MAX_UPLOAD_SIZE_MB: int = 50
    STORAGE_ROOT: str = "storage"
    UPLOADS_DIR: str = "uploads"
    COVERS_DIR: str = "covers"
    BOOKS_DIR: str = "books"
    PDF_DIR: str = "pdf"
    EPUB_DIR: str = "epub"
    TEMP_DIR: str = "temporary"
    ALLOWED_COVER_EXTENSIONS: set[str] = {".png", ".jpg", ".jpeg", ".webp"}
    ALLOWED_BOOK_EXTENSIONS: set[str] = {".pdf", ".epub"}
    STORAGE_PROVIDER: str = "local"
    FILEBASE_ACCESS_KEY: str = ""
    FILEBASE_SECRET_KEY: str = ""
    FILEBASE_ENDPOINT: str = "https://s3.filebase.io"
    FILEBASE_BUCKET: str = "bookwise-books"
    FILEBASE_REGION: str = "auto"
    # AI Reader (retrieval-augmented answers from a book's own text)
    AI_PROVIDER: str = "anthropic"  # anthropic | groq: which service writes the answers
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "openai/gpt-oss-120b"
    # Tried in order when a model hits its free-tier limit (each model has its own limit).
    GROQ_FALLBACK_MODELS: str = "qwen/qwen3.8-27b,openai/gpt-oss-20b"
    # Groq's free tier allows ~8,000 tokens a minute, so keep each request small.
    GROQ_MAX_OUTPUT_TOKENS: int = Field(default=1500, gt=0)
    GROQ_MAX_PASSAGES: int = Field(default=10, gt=0)
    # Before searching, the AI turns the question into a few search phrases (helps when
    # the book describes a scene in other words, and with follow-ups like "what next?").
    AI_QUERY_REWRITE: bool = True
    # The larger model knows the plots better; gpt-oss-20b invented wrong scenes in tests.
    GROQ_REWRITE_MODEL: str = "openai/gpt-oss-120b"
    ANTHROPIC_API_KEY: str = ""
    AI_MODEL: str = "claude-opus-5-5"
    AI_EFFORT: str = "low"
    AI_MAX_OUTPUT_TOKENS: int = Field(default=16000, gt=0)
    AI_REQUESTS_PER_HOUR: int = Field(default=30, ge=0)
    AI_AUTO_INDEX_UPLOADS: bool = True
    # Local embedding model run on the API server (fastembed / ONNX). Its vector size
    # is fixed by the book_chunks migration (384), so changing it needs a new migration;
    # a different 384-size model only needs re-indexing (done automatically on start).
    # granite-small-r2 found the right passage far more often than bge-small-en-v1.5 on
    # dialogue-heavy novels in tests.
    EMBEDDING_MODEL: str = "ibm-granite/granite-embedding-small-english-r2"
    EMBEDDING_CACHE_DIR: str = "models"
    # Passages embedded per batch while indexing. Measured with the whole API loaded:
    # 1 -> ~410 MB peak, 8 -> ~770 MB, 16 -> ~1.2 GB, and batch 1 was not slower on CPU.
    # Keep 1 on small servers (e.g. Render's 512 MB).
    EMBEDDING_BATCH_SIZE: int = Field(default=1, ge=1, le=64)
    # Load the search model in the background at startup so the first question is quick.
    AI_PRELOAD_MODEL: bool = True
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    @field_validator("STORAGE_PROVIDER")
    @classmethod
    def validate_storage_provider(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in {"local", "filebase"}:
            raise ValueError("STORAGE_PROVIDER must be 'local' or 'filebase'")
        return normalized

    @field_validator("AI_PROVIDER")
    @classmethod
    def validate_ai_provider(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in {"anthropic", "groq"}:
            raise ValueError("AI_PROVIDER must be 'anthropic' or 'groq'")
        return normalized

    @field_validator("AI_EFFORT")
    @classmethod
    def validate_ai_effort(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in {"low", "medium", "high", "xhigh", "max"}:
            raise ValueError("AI_EFFORT must be one of low, medium, high, xhigh, max")
        return normalized

    @property
    def embedding_cache_path(self) -> Path:
        return self.storage_root_path / self.EMBEDDING_CACHE_DIR

    @property
    def project_root(self) -> Path:
        return Path(__file__).resolve().parents[2]

    @property
    def storage_root_path(self) -> Path:
        return self.project_root / self.STORAGE_ROOT

    @property
    def cors_allow_origins(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ALLOW_ORIGINS.split(",") if origin.strip()]

    @model_validator(mode="after")
    def validate_auth_configuration(self) -> "Settings":
        if len(self.AUTH_SECRET_KEY) < 32:
            raise ValueError("AUTH_SECRET_KEY must contain at least 32 characters")
        if self.ENVIRONMENT.lower() in {"production", "prod"} and self.AUTH_SECRET_KEY.startswith("development-only-"):
            raise ValueError("Set a unique AUTH_SECRET_KEY before running in production")
        return self


settings = Settings()
