/**
 * Environment configuration for the LangGraph agent (OpenAI + LangSmith).
 * Load .env in entrypoint (e.g. via tsx --env-file=.env or dotenv).
 */

function getEnv(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvOptional(key: string, defaultValue: string): string {
  const value = process.env[key];
  return value === undefined || value === "" ? defaultValue : value;
}

export const agentEnv = {
  openai: {
    apiKey: () => getEnv("OPENAI_API_KEY"),
    model: () => getEnvOptional("OPENAI_MODEL", "gpt-4.1-mini"),
  },
  elasticsearch: {
    url: () => getEnvOptional("ELASTICSEARCH_URL", "http://localhost:9200"),
    indexFretes: () => getEnvOptional("ELASTICSEARCH_INDEX_FRETES", "fretes"),
    username: () => getEnvOptional("ELASTICSEARCH_USER", ""),
    password: () => getEnvOptional("ELASTICSEARCH_PASSWORD", ""),
    geoRadiusOriginKm: () => Number.parseInt(getEnvOptional("ELASTICSEARCH_GEO_RADIUS_ORIGEM_KM", "150"), 10),
    geoRadiusDestinationKm: () => Number.parseInt(getEnvOptional("ELASTICSEARCH_GEO_RADIUS_DESTINO_KM", "50"), 10),
  },
  redis: {
    url: () => getEnvOptional("REDIS_URL", "redis://localhost:6379"),
  },
  sagBackend: {
    url: () => getEnvOptional("SAG_BACKEND_URL", "https://sag-backend.roduno.work"),
  },
  n8n: {
    webhookUrl: () => getEnvOptional("N8N_WEBHOOK_CONTRATAR_FRETE", ""),
    webhookFreteCotacaoUrl: () =>
      getEnvOptional("N8N_WEBHOOK_FRETE_COTACAO", "https://llm-llm-n8n.bmlwrg.easypanel.host/webhook/frete-cotacao"),
  },
  langsmith: {
    apiKey: () => getEnvOptional("LANGSMITH_API_KEY", ""),
    project: () => getEnvOptional("LANGSMITH_PROJECT", "llm-rodezio-agent"),
    // Optional: explicit project UUID (from LangSmith URL)
    projectId: () => getEnvOptional("LANGSMITH_PROJECT_ID", ""),
    workspace: () => getEnvOptional("LANGSMITH_WORKSPACE", "default"),
    // Optional: explicit workspace UUID (from LangSmith URL)
    workspaceId: () => getEnvOptional("LANGSMITH_WORKSPACE_ID", ""),
    tracing: () => process.env.LANGSMITH_TRACING !== "false" && process.env.LANGSMITH_TRACING !== "0",
  },
} as const;

/** Call before running the agent if you want to enforce LangSmith when tracing is enabled. */
export function ensureLangSmithEnv(): void {
  if (agentEnv.langsmith.tracing() && !agentEnv.langsmith.apiKey()) {
    console.warn("LANGSMITH_API_KEY is not set; tracing will be disabled.");
  }
}
