"""Runtime configuration, read from environment variables / `.env`."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

LLMProviderName = Literal["auto", "ollama", "anthropic", "openai", "heuristic"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Look for .env in the repo root first, then in backend/.
        env_file=(Path(__file__).resolve().parents[2] / ".env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Storage
    signallab_data_dir: Path = Path("./data")
    keep_media: bool = False

    # yt-dlp
    ytdlp_cookies_from_browser: str = ""
    ytdlp_cookies_file: str = ""

    # Whisper
    whisper_model: str = "small"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"
    min_speech_words: int = 8

    # LLM
    llm_provider: LLMProviderName = "auto"
    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "llama3.1:8b"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-haiku-5-5"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    llm_timeout_seconds: float = 180.0

    # Embeddings
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"

    # Graph
    graph_similarity_threshold: float = 0.45
    graph_max_neighbors: int = 6

    # GitHub
    github_token: str = ""
    github_max_pages: int = 10  # 100 stars/page

    # Server
    cors_origins: str = "http://localhost:3000"
    worker_concurrency: int = 1

    @property
    def db_path(self) -> Path:
        return self.signallab_data_dir / "signallab.sqlite3"

    @property
    def media_dir(self) -> Path:
        return self.signallab_data_dir / "media"

    @property
    def sandbox_dir(self) -> Path:
        return self.signallab_data_dir / "sandboxes"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def ensure_dirs(self) -> None:
        for d in (self.signallab_data_dir, self.media_dir, self.sandbox_dir):
            d.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    return Settings()
