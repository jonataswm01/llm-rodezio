import { initializeLangSmith } from "../../config/langsmith.js";

initializeLangSmith();

import { runAgent } from "./graph";
import { agentEnv, ensureLangSmithEnv } from "./config";

export { runAgent } from "./graph";
export { agentEnv, ensureLangSmithEnv } from "./config";

/**
 * Opens LangSmith project page in the browser to view traces.
 */
async function openLangSmithStudio(): Promise<void> {
  const { default: open } = await import("open");
  const projectId = agentEnv.langsmith.projectId();
  const project = agentEnv.langsmith.project();
  const workspaceId = agentEnv.langsmith.workspaceId();
  const workspace = agentEnv.langsmith.workspace();

  // Use UUIDs if available, otherwise fall back to names
  // For the URL, we prefer UUIDs: https://smith.langchain.com/o/{workspace-uuid}/projects/p/{project-uuid}
  const workspaceParam = workspaceId || workspace;
  const projectParam = projectId || project;

  const projectUrl = `https://smith.langchain.com/o/${encodeURIComponent(
    workspaceParam,
  )}/projects/p/${encodeURIComponent(projectParam)}`;

  try {
    console.log(`\n🔗 Abrindo LangSmith para o projeto...`);
    if (workspaceId) {
      console.log(`   Workspace ID: ${workspaceId}`);
    } else {
      console.log(`   Workspace: ${workspace} (use LANGSMITH_WORKSPACE_ID para URL mais precisa)`);
    }
    if (projectId) {
      console.log(`   Projeto ID: ${projectId}`);
    } else {
      console.log(`   Projeto: ${project} (use LANGSMITH_PROJECT_ID para URL mais precisa)`);
    }
    console.log(`   URL: ${projectUrl}\n`);
    await open(projectUrl);
  } catch {
    console.warn("⚠️  Não foi possível abrir o navegador automaticamente.");
    console.warn(`   Abra manualmente: ${projectUrl}`);
  }
}

/**
 * When this file is run directly (e.g. pnpm agent:dev), read input from CLI or use a default prompt and log the response.
 */
async function main(): Promise<void> {
  ensureLangSmithEnv();
  const key = agentEnv.langsmith.apiKey();
  if (key && agentEnv.langsmith.tracing()) {
    process.env.LANGSMITH_TRACING = "true";
    // Use project ID if available, otherwise use project name (both work for tracing)
    process.env.LANGSMITH_PROJECT =
      agentEnv.langsmith.projectId() || agentEnv.langsmith.project();
    process.env.LANGSMITH_API_KEY = key;
    // Set workspace ID if available (helps with tracing)
    const workspaceId = agentEnv.langsmith.workspaceId();
    if (workspaceId) {
      process.env.LANGSMITH_WORKSPACE_ID = workspaceId;
    }
    
    // Open LangSmith Studio automatically
    await openLangSmithStudio();
  } else {
    console.warn("⚠️  LangSmith não está configurado. Configure LANGSMITH_API_KEY para habilitar tracing.");
  }
  
  const input = process.argv[2] ?? "Olá! Em uma frase, o que você é?";
  process.env.RODEZIO_DEBUG = "true";
  const { log } = await import("../../utils/logger.js");
  log.info("Input:", input);
  log.step("Executando agente (modo com logs)...");
  const response = await runAgent(input, { log: true });
  log.success("Resposta:", response);
}

const isMain = process.argv[1]?.includes("langgraph");
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
