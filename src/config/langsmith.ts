/**
 * Configuração centralizada para LangSmith (Observabilidade e Tracing).
 */

/**
 * Inicializa a configuração do LangSmith baseada em variáveis de ambiente.
 *
 * Variáveis necessárias no .env:
 * - LANGSMITH_API_KEY: Sua chave de API do LangSmith
 * - LANGSMITH_TRACING: "true" para habilitar o rastreamento
 * - LANGSMITH_PROJECT: Nome do projeto no LangSmith (default: "llm-rodezio-agent")
 */
export function initializeLangSmith(): void {
  const isTracingEnabled = process.env.LANGSMITH_TRACING === "true";
  const apiKey = process.env.LANGSMITH_API_KEY;
  const project = process.env.LANGSMITH_PROJECT ?? "llm-rodezio-agent";

  if (isTracingEnabled && apiKey) {
    console.log(`📊 [LANGSMITH] Tracing habilitado para o projeto: ${project}`);

    // As variáveis de ambiente já são usadas automaticamente pelo SDK do LangChain/LangSmith
    // se estiverem presentes no process.env.

    // Garantimos que as variáveis padrões do LangChain estejam configuradas
    process.env.LANGCHAIN_TRACING_V2 = "true";
    process.env.LANGCHAIN_API_KEY = apiKey;
    process.env.LANGCHAIN_PROJECT = project;

    if (process.env.LANGSMITH_ENDPOINT) {
      process.env.LANGCHAIN_ENDPOINT = process.env.LANGSMITH_ENDPOINT;
    }
  } else if (isTracingEnabled && !apiKey) {
    console.warn("⚠️ [LANGSMITH] Tracing habilitado mas LANGSMITH_API_KEY não foi configurada.");
  } else {
    // Desabilita explicitamente o tracing
    process.env.LANGCHAIN_TRACING_V2 = "false";
  }
}

/**
 * Retorna tags padrão para serem usadas nos traces do LangSmith
 *
 * @param agentType Tipo do agente (ex: "extractor", "insulfilm", etc)
 */
export function getDefaultTags(agentType: string): string[] {
  const env = process.env.NODE_ENV ?? "development";
  return [`agent:${agentType}`, `env:${env}`];
}

/**
 * Retorna metadados padrão para os traces
 */
export function getDefaultMetadata(
  agentType: string,
  extraMetadata: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    agent_type: agentType,
    env: process.env.NODE_ENV ?? "development",
    ...extraMetadata,
  };
}
