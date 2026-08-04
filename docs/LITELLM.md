# LiteLLM Integration

LiteLLM acts as a unified proxy to LLM providers (Poolside, OpenRouter, etc.) for the Story Builder pipeline. This document is the single source of truth for how LiteLLM works in this project.

## Why LiteLLM Runs on the Host

The LiteLLM container cannot reach external APIs (poolside.ai, openrouter.ai) because Podman rootless without `aardvark-dns` means containers have no DNS resolution. External HTTPS endpoints fail with `Temporary failure in name resolution`.

**Solution**: Run LiteLLM on the host where DNS works, and have the server container reach it via `host.containers.internal`.

## Starting LiteLLM

```bash
# Start LiteLLM on the host (background)
litellm --config ~/litellm_config/config.yaml --port 4000 &

# Verify it's running (/health/liveliness is unauthenticated — matches the
# docker-compose healthcheck for the disabled litellm service)
sleep 3 && curl -fsS --connect-timeout 5 http://localhost:4000/health/liveliness
```

## Configuration

The config file (`~/litellm_config/config.yaml`) defines the models and their provider settings:

```yaml
model_list:
  - model_name: poolside/laguna-m.1
    litellm_params:
      model: openai/poolside/laguna-m.1
      api_key: <your-poolside-api-key>
      api_base: https://inference.poolside.ai/v1
  - model_name: openrouter/owl-alpha
    litellm_params:
      model: openrouter/owl-alpha
      api_key: <your-openrouter-api-key>
      api_base: https://openrouter.ai/api/v1
      modify_params: True

general_settings:
  master_key: local-key
```

## Server Environment Variables

When starting the server container, add these env vars:

```bash
-e LITELLM_BASE_URL=http://host.containers.internal:4000 \
-e LITELLM_API_KEY=local-key \
-e LLM_PROVIDER=litellm \
-e LLM_MODEL=poolside/laguna-m.1 \
```

| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | `mock` | Backend: `mock`, `litellm`, `gemini`, or `groq`. All real providers use the LiteLLM proxy. |
| `LITELLM_BASE_URL` | `http://litellm:4000` (compose overrides to `http://host.containers.internal:4000`) | LiteLLM gateway URL. Required when `LLM_PROVIDER=litellm`. The code falls back to `http://litellm:4000` when unset; docker-compose overrides to `http://host.containers.internal:4000` for host-side access. |
| `LITELLM_API_KEY` | *(empty; compose defaults to `local-key`)* | API key for LiteLLM proxy auth (must match `master_key` in config). The code falls back to `''` when unset; docker-compose sets `${LITELLM_API_KEY:-local-key}`. |
| `LLM_MODEL` | `poolside/laguna-m.1` | Model alias from `config.yaml`. |
| `LLM_TIMEOUT_MS` | `60000` | Base timeout for LLM calls (ms). |
| `LLM_MAX_TIMEOUT_MS` | `300000` | Cap for escalating timeout retries (ms). |
| `LLM_OUTLINE_MODEL` | *(empty)* | Optional separate model for outline step (defaults to `LLM_MODEL`). |
| `LLM_OUTLINE_MAX_TOKENS` | `4096` | Max output tokens for outline LLM calls. |
| `LLM_OUTLINE_INITIAL_MAX_ITEMS` | `15` | Initial item cap for outline generation (halved on truncation retry). |

**Critical**: `LLM_PROVIDER` defaults to `mock` if not set. The mock provider returns minimal deterministic plans (1 item, 0 asset needs) — useful for testing the pipeline mechanically but won't generate real content.

## How the Server Connects to LiteLLM

The `LiteLLMProvider` class (`server/src/services/LiteLLMProvider.ts`) is the sole LLM integration point. It:

1. Reads `LITELLM_BASE_URL`, `LITELLM_API_KEY`, and `LLM_MODEL` from environment variables.
2. Sends requests to `${LITELLM_BASE_URL}/v1/chat/completions` using the OpenAI-compatible API format.
3. Retries failed requests up to 2 times with exponential backoff (1s, 2s).
4. Escalates timeouts on retry (doubles each attempt, capped at `LLM_MAX_TIMEOUT_MS`).
5. Falls back to `reasoning_content` when `content` is null (some poolside models omit `content` on the first chunk).
6. Extracts JSON from markdown code fences in responses.

The `LLMService.createLLMProvider()` factory (`server/src/services/LLMService.ts`) routes `litellm`, `gemini`, and `groq` providers through `LiteLLMProvider`, while `mock` uses `MockProvider`.

## Docker Compose

The `docker-compose.yml` includes a `litellm` service definition, but it is **disabled** (`profiles: ["disabled"]`) because the container cannot reach external APIs. The service is kept for reference only.

```yaml
litellm:
  image: ghcr.io/berriai/litellm:main-latest
  profiles: ["disabled"]  # LiteLLM runs on HOST, not in container
  # ...
```

## Troubleshooting

### LiteLLM not responding
1. Ensure LiteLLM is running: `litellm --config ~/litellm_config/config.yaml --port 4000`
2. Verify LiteLLM is reachable: `curl -fsS --connect-timeout 5 http://localhost:4000/health/liveliness`
3. Test connectivity from server container: `podman exec las-flores-server wget -qO- --header="Authorization: Bearer local-key" http://host.containers.internal:4000/v1/models`
4. If DNS resolution fails, use the host's actual IP address in `LITELLM_BASE_URL`.

### Connection errors from server
- **`Cannot reach LiteLLM at ...`**: Check that LiteLLM is running and that `LITELLM_BASE_URL` is correct. With Podman rootless, `host.containers.internal` may not resolve without `aardvark-dns`. Try using the host's IP address directly.
- **`Temporary failure in name resolution`**: LiteLLM container has no DNS. Run LiteLLM on the host instead.

### Using mock provider for testing
Set `LLM_PROVIDER=mock` in the server environment to bypass LiteLLM entirely. This returns minimal deterministic plans useful for mechanical pipeline testing.