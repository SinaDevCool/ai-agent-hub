# llama.cpp sidecar

Place the platform-specific `llama-server` executable here before packaging:

- Windows: `llama-server.exe`
- macOS/Linux: `llama-server`

The release preparation script downloads a pinned llama.cpp release, verifies its SHA-256 digest, and stages only the required executable and runtime libraries. Development builds intentionally fail at runtime with a clear message when the sidecar has not been staged.
