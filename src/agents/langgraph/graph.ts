import { createReactAgent } from "@langchain/langgraph/prebuilt";
import type { AIMessage, BaseMessage } from "@langchain/core/messages";
import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { agentEnv } from "./config.js";
import { pesquisarFretesTool } from "./tools/pesquisar-fretes.js";
import { log } from "../../utils/logger.js";

const llm = new ChatOpenAI({
  apiKey: agentEnv.openai.apiKey(),
  model: agentEnv.openai.model(),
  temperature: 0,
});

const SYSTEM_PROMPT = `Você é o Rodezio, um assistente especializado em fretes e logística.

Quando o usuário perguntar sobre fretes, cargas, preços de transporte ou disponibilidade de cargas, use a ferramenta pesquisar_fretes para buscar no banco de dados. Passe a pesquisa em linguagem natural (ex: "fretes de São Paulo para Curitiba de grãos").

Quando a pergunta NÃO for sobre fretes (ex: cumprimentos, dúvidas gerais, informações que você já conhece), responda diretamente sem usar ferramentas.

Sempre responda em português brasileiro. Ao apresentar fretes, formate de forma clara e útil para o usuário.`;

const compiled = createReactAgent({
  llm,
  tools: [pesquisarFretesTool],
  prompt: SYSTEM_PROMPT,
});

export const agent = compiled;

function logMessage(msg: BaseMessage): void {
  const role = "role" in msg ? msg.role : msg._getType?.() ?? "unknown";
  if (role === "human" || msg instanceof HumanMessage) {
    const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
    log.agent("Usuário disse:", content.slice(0, 200) + (content.length > 200 ? "..." : ""));
    return;
  }
  if (role === "ai" || (msg as AIMessage).content !== undefined) {
    const ai = msg as AIMessage;
    const content = typeof ai.content === "string" ? ai.content : "";
    if (content) {
      log.thinking(content);
    }
    const toolCalls = (ai as { tool_calls?: Array<{ name?: string; args?: unknown }> }).tool_calls;
    if (toolCalls?.length) {
      for (const tc of toolCalls) {
        log.tool(`Chamando "${tc.name}" com args:`, JSON.stringify(tc.args ?? {}, null, 2));
      }
    }
    return;
  }
  if (role === "tool") {
    const content = typeof (msg as { content?: string }).content === "string" ? (msg as { content: string }).content : "";
    log.tool("Resultado da tool:", content.slice(0, 300) + (content.length > 300 ? "..." : ""));
  }
}

/**
 * Run the agent with the given user input and return the assistant reply text.
 * @param userInput - Mensagem do usuário
 * @param options.log - Se true, usa stream e exibe logs passo a passo (incluindo pensamento da IA)
 */
export async function runAgent(userInput: string, options?: { log?: boolean }): Promise<string> {
  const useLogs = options?.log ?? (process.env.RODEZIO_DEBUG === "true" || process.env.DEBUG === "true");

  if (!useLogs) {
    const result = await compiled.invoke({
      messages: [new HumanMessage(userInput)],
    });
    const messages = result.messages ?? [];
    const last = messages[messages.length - 1];
    if (last && "content" in last && typeof last.content === "string") {
      return last.content;
    }
    return "";
  }

  log.step("Iniciando agente ReAct...");
  log.agent("Pergunta do usuário:", userInput);

  let lastContent = "";
  let prevLen = 1;
  const stream = await compiled.stream(
    { messages: [new HumanMessage(userInput)] },
    { streamMode: "values" },
  );
  for await (const chunk of stream) {
    const messages = (chunk as { messages?: BaseMessage[] }).messages ?? [];
    for (let i = prevLen; i < messages.length; i++) {
      logMessage(messages[i]!);
    }
    prevLen = messages.length;
    const last = messages[messages.length - 1];
    if (last && "content" in last && typeof last.content === "string") {
      lastContent = last.content;
    }
  }

  log.step("Agente finalizou.");
  return lastContent;
}
