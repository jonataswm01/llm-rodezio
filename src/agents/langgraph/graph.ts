import { createReactAgent } from "@langchain/langgraph/prebuilt";
import type { AIMessage, BaseMessage } from "@langchain/core/messages";
import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { randomUUID } from "node:crypto";
import { agentEnv } from "./config.js";
import { runWithThreadId } from "./context.js";
import { pesquisarFretesTool } from "./tools/pesquisar-fretes.js";
import { contratarFreteTool } from "./tools/contratar-frete.js";
import { checkpointer } from "./checkpointer.js";
import { log } from "../../utils/logger.js";

const llm = new ChatOpenAI({
  apiKey: agentEnv.openai.apiKey(),
  model: agentEnv.openai.model(),
  temperature: 0,
});

const SYSTEM_PROMPT = `Você é o Rodezio, um amigo do caminhoneiro. Fale como uma pessoa real, de forma direta e descontraída. Evite tom robótico ou formal.

Quando o usuário perguntar sobre fretes, use a ferramenta pesquisar_fretes. Passe a pesquisa em linguagem natural (ex: "fretes de São Paulo para Curitiba de grãos").

Quando o usuário demonstrar intenção de contratar/pegar um frete (ex: "quero esse", "quero o segundo", "me interessa o de X para Y", "quero contratar"), use a ferramenta contratar_frete passando o índice (1 = primeiro da lista, 2 = segundo, etc). Nunca invente dados de frete — use sempre o índice da lista que você mostrou.

Quando a pergunta NÃO for sobre fretes (cumprimentos, dúvidas gerais), responda direto sem usar ferramentas.

AO APRESENTAR FRETES:
- Sempre mostre a lista completa que a ferramenta retornou. O caminhoneiro precisa ver todas as opções.
- NUNCA use números para listar (1., 2., 3.). Use bullet (•) ou traço (-). A ferramenta já retorna no formato correto.
- Não resuma nem omita fretes. Mesmo que não sejam da rota exata, mostre todos — podem servir.
- Fale de forma natural: "Olha, achei uns fretes aqui...", "Dá uma olhada nesses...", "Não achei exatamente o que você pediu, mas tem uns próximos que podem te interessar".
- Evite frases como "Se quiser, posso ajudar" ou "Posso buscar em outras rotas" no final — soa robótico. Se for oferecer mais ajuda, seja mais natural.

AO CONTRATAR FRETE:
- Após chamar contratar_frete com sucesso, responda exatamente o que a ferramenta retornar (mensagem de que entrou em contato com o embarcador).
- NUNCA informe o contato do embarcador, mesmo que o usuário peça.

Responda sempre em português brasileiro, como um colega falando com outro.`;

const compiled = createReactAgent({
  llm,
  tools: [pesquisarFretesTool, contratarFreteTool],
  prompt: SYSTEM_PROMPT,
  checkpointer,
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
export async function runAgent(userInput: string, options?: { log?: boolean; threadId?: string }): Promise<string> {
  const useLogs = options?.log ?? (process.env.RODEZIO_DEBUG === "true" || process.env.DEBUG === "true");
  const threadId = options?.threadId || randomUUID();

  // Config com thread_id para memória de conversa
  const config = { configurable: { thread_id: threadId } };

  log.info(`runAgent: iniciando (modo log=${useLogs}, threadId=${threadId})`);

  try {
    if (!useLogs) {
      log.info("runAgent: chamando LLM (modo invoke, sem stream)...");
      const result = await runWithThreadId(threadId, () =>
        compiled.invoke(
          { messages: [new HumanMessage(userInput)] },
          config,
        ),
      );
      const messages = result.messages ?? [];
      log.info("runAgent: LLM retornou", messages.length, "mensagens");
      const last = messages[messages.length - 1];
      if (last && "content" in last && typeof last.content === "string") {
        log.info("runAgent: resposta extraída (length:", last.content.length, ")");
        return last.content;
      }
      log.warn("runAgent: última mensagem sem content string, retornando vazio");
      return "";
    }

    log.step("Iniciando agente ReAct (stream)...");
    log.agent("Pergunta do usuário:", userInput);

    let lastContent = "";
    let prevLen = 1;
    let chunkCount = 0;
    const stream = await runWithThreadId(threadId, () =>
      compiled.stream(
        { messages: [new HumanMessage(userInput)] },
        { ...config, streamMode: "values" },
      ),
    );
    for await (const chunk of stream) {
      chunkCount++;
      const messages = (chunk as { messages?: BaseMessage[] }).messages ?? [];
      for (let i = prevLen; i < messages.length; i++) {
        const msg = messages[i];
        if (msg) logMessage(msg);
      }
      prevLen = messages.length;
      const last = messages[messages.length - 1];
      if (last && "content" in last && typeof last.content === "string") {
        lastContent = last.content;
      }
    }

    log.info("runAgent: stream finalizado (", chunkCount, "chunks,", prevLen, "mensagens)");
    log.step("Agente finalizou.");
    return lastContent;
  } catch (err) {
    log.error("runAgent: erro —", err instanceof Error ? err.message : String(err));
    if (err instanceof Error && err.stack) {
      console.error("runAgent stack:", err.stack);
    }
    throw err;
  }
}
