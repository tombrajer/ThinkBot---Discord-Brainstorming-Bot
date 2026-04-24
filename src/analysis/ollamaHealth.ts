interface OllamaHealthCheckOptions {
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

const withNoTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const formatInstalledModels = (models: string[]): string =>
  models.length > 0 ? models.join(", ") : "(none)";

export const validateOllamaHealth = async (
  options: OllamaHealthCheckOptions,
): Promise<void> => {
  const baseUrl = withNoTrailingSlash(options.baseUrl);
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  let status = "ok";

  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: "GET",
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        [
          `Ollama health check failed at ${baseUrl}/api/tags (${response.status}).`,
          "Verify OLLAMA_BASE_URL is correct and points to a running Ollama HTTP API.",
          `Response: ${body}`,
        ].join(" "),
      );
    }

    const payload = (await response.json()) as {
      models?: Array<{ name?: string }>;
    };
    const installedModels = (payload.models ?? [])
      .map((entry) => entry.name?.trim() ?? "")
      .filter(Boolean);
    const hasConfiguredModel = installedModels.includes(options.model);

    if (!hasConfiguredModel) {
      throw new Error(
        [
          `Configured model '${options.model}' was not found on Ollama.`,
          `Installed models: ${formatInstalledModels(installedModels)}.`,
          "Set OLLAMA_MODEL to an exact model name from 'ollama list' or run 'ollama pull <model>'.",
        ].join(" "),
      );
    }
  } catch (error) {
    status = "error";
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.message.toLowerCase().includes("aborted"))
    ) {
      throw new Error(
        [
          `Timed out connecting to Ollama at ${baseUrl}/api/tags after ${options.timeoutMs}ms.`,
          "Ollama may still be loading a model; increase OLLAMA_TIMEOUT_MS if needed.",
        ].join(" "),
      );
    }

    if (error instanceof Error && error.message.includes("Failed to fetch")) {
      throw new Error(
        [
          `Could not reach Ollama at ${baseUrl}.`,
          "Ensure the Ollama desktop/background service is running.",
          "If this app runs in Docker, set OLLAMA_BASE_URL=http://host.docker.internal:11434.",
        ].join(" "),
      );
    }

    throw error;
  } finally {
    clearTimeout(timer);
    const durationMs = Date.now() - startedAt;
    console.info(
      `[ollama] Health check status=${status} baseUrl=${baseUrl} model=${options.model} timeoutMs=${options.timeoutMs} durationMs=${durationMs}`,
    );
  }
};
