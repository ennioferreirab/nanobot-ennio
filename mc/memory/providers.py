"""Embedding provider abstractions for memory search."""

from __future__ import annotations

from typing import Any, Protocol


class EmbeddingProvider(Protocol):
    """Interface for text embedding providers."""

    def embed(self, texts: list[str]) -> list[list[float]] | None:
        """Return vector embeddings for input texts, or None if disabled."""


class NullProvider:
    """No-op provider used when embeddings are disabled."""

    def embed(self, texts: list[str]) -> list[list[float]] | None:
        return None


class LiteLLMProvider:
    """Embedding provider backed by ``litellm.embedding``."""

    def __init__(self, model: str) -> None:
        self.model = model

    def embed(self, texts: list[str]) -> list[list[float]] | None:
        import litellm

        try:
            response = litellm.embedding(model=self.model, input=texts)
        except Exception:
            return None
        data: Any = getattr(response, "data", None)
        if data is None and isinstance(response, dict):
            data = response.get("data")

        if not isinstance(data, list):
            return None

        vectors: list[list[float]] = []
        for item in data:
            if isinstance(item, dict):
                embedding = item.get("embedding")
            else:
                embedding = getattr(item, "embedding", None)
            if isinstance(embedding, list):
                vectors.append([float(v) for v in embedding])

        return vectors


def get_provider(model: str | None) -> EmbeddingProvider:
    """Return embedding provider for the configured model."""

    if model is None:
        return NullProvider()
    return LiteLLMProvider(model)
