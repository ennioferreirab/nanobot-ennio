from mc.memory.providers import LiteLLMProvider, NullProvider, get_provider


def test_null_provider_returns_none():
    provider = NullProvider()
    assert provider.embed(["hello"]) is None


def test_get_provider_none_returns_null_provider():
    provider = get_provider(None)
    assert isinstance(provider, NullProvider)


def test_get_provider_model_returns_litellm_provider():
    provider = get_provider("ollama/nomic-embed-text")
    assert isinstance(provider, LiteLLMProvider)
