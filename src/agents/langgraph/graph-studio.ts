/**
 * Entrypoint para o LangGraph Studio.
 * Reutiliza o grafo de graph.ts para evitar duplicação.
 */
import { initializeLangSmith } from "../../config/langsmith.js";

initializeLangSmith();

export { agent } from "./graph.js";
