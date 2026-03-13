/**
 * Serviços de contexto da conversa a partir do histórico do checkpointer.
 *
 * - getConversationSummary: resumo via LLM, usado no payload n8n (contratar/cotação)
 * - formatMessagesToCleanHistory: formata mensagens no formato Usuário/Assistente para a IA
 */

import type { AIMessage, BaseMessage } from "@langchain/core/messages";
import { isAIMessage, isToolMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { checkpointer } from "../checkpointer.js";
import { agentEnv } from "../config.js";
import { log } from "../../../utils/logger.js";

const MAX_MESSAGES_FOR_SUMMARY = 20;
const THRESHOLD_LIMITED_CONTEXT = 25;
const MAX_MESSAGES_WHEN_LIMITED = 25;
const MAX_CHARS_WHEN_LIMITED = 6000;
const MAX_CHARS_OLD_MESSAGE = 80;
const RECENT_MESSAGES_FULL = 10;

function messagesToText(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  return messages
    .slice(-MAX_MESSAGES_FOR_SUMMARY)
    .map((m) => {
      const msg = m as BaseMessage;
      const role = "role" in msg ? msg.role : msg._getType?.() ?? "unknown";
      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "");
      return `[${role}]: ${content}`;
    })
    .join("\n");
}

/**
 * Obtém um resumo curto (2-4 frases) da conversa do thread.
 * Retorna string vazia se não houver histórico.
 */
export async function getConversationSummary(threadId: string): Promise<string> {
  if (!threadId) return "";

  try {
    const tuple = await checkpointer.getTuple({
      configurable: { thread_id: threadId },
    });
    if (!tuple?.checkpoint?.channel_values) return "";

    const messages = tuple.checkpoint.channel_values.messages as unknown;
    const text = messagesToText(messages);
    if (!text.trim()) return "";

    const llm = new ChatOpenAI({
      apiKey: agentEnv.openai.apiKey(),
      model: agentEnv.openai.model(),
      temperature: 0,
    });

    const prompt = `Resuma em 2 a 4 frases o contexto desta conversa entre caminhoneiro e assistente. Foque no que o caminhoneiro pediu e qual frete demonstrou interesse.

Conversa:
${text.slice(-2000)}

Resumo em português:`;

    const response = await llm.invoke([{ role: "user", content: prompt }]);
    const summary = typeof response.content === "string" ? response.content : String(response.content ?? "");
    return summary.trim() || text.slice(0, 500);
  } catch (err) {
    log.error("[ConversationSummary] Erro:", err instanceof Error ? err.message : String(err));
    return "";
  }
}

function formatToolCallBrief(toolCalls: Array<{ name?: string; args?: unknown }>): string {
  if (!toolCalls?.length) return "";
  return toolCalls
    .map((tc) => {
      const name = tc.name ?? "unknown";
      const args = tc.args as Record<string, unknown> | undefined;
      const argsStr = args ? Object.entries(args).map(([k, v]) => `${k}: ${String(v)}`).join(", ") : "";
      return argsStr ? `[chamando ${name} com ${argsStr}]` : `[chamando ${name}]`;
    })
    .join(" ");
}

/**
 * Formata mensagens do estado no formato limpo para a IA.
 * HumanMessage → "Usuário: ..."
 * AIMessage (tool_call) → "Assistente: [chamando X com ...]"
 * ToolMessage → omitido
 * AIMessage (content) → "Assistente: ..." (completo, sem truncar)
 *
 * Para conversas longas (> 25 msgs): mensagens antigas truncadas, últimas completas.
 */
export function formatMessagesToCleanHistory(
  messages: BaseMessage[],
  options?: { maxMessages?: number; maxChars?: number },
): string {
  if (!Array.isArray(messages) || messages.length === 0) return "";

  const maxMessages = options?.maxMessages ?? THRESHOLD_LIMITED_CONTEXT;
  const maxChars = options?.maxChars ?? MAX_CHARS_WHEN_LIMITED;
  const useLimits = messages.length > THRESHOLD_LIMITED_CONTEXT;

  const toProcess = useLimits ? messages.slice(-maxMessages) : messages;
  const lines: string[] = [];
  const truncateOld = useLimits && toProcess.length > RECENT_MESSAGES_FULL;
  const cutoffIndex = toProcess.length - RECENT_MESSAGES_FULL;

  for (let i = 0; i < toProcess.length; i++) {
    const msg = toProcess[i] as BaseMessage;
    const type = msg._getType?.() ?? "unknown";
    const shouldTruncate = truncateOld && i < cutoffIndex;

    if (type === "human") {
      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "");
      if (!content.trim()) continue;
      const truncated = shouldTruncate ? content.slice(0, MAX_CHARS_OLD_MESSAGE) + (content.length > MAX_CHARS_OLD_MESSAGE ? "..." : "") : content;
      lines.push(`Usuário: ${truncated}`);
      continue;
    }

    if (isToolMessage(msg)) continue;

    if (isAIMessage(msg)) {
      const ai = msg as AIMessage;
      const toolCalls = (ai as { tool_calls?: Array<{ name?: string; args?: unknown }> }).tool_calls;

      if (toolCalls?.length) {
        const brief = formatToolCallBrief(toolCalls);
        if (brief) lines.push(`Assistente: ${brief}`);
        continue;
      }

      const content = typeof ai.content === "string" ? ai.content : JSON.stringify(ai.content ?? "");
      if (!content.trim()) continue;
      const truncated = shouldTruncate ? content.slice(0, MAX_CHARS_OLD_MESSAGE) + (content.length > MAX_CHARS_OLD_MESSAGE ? "..." : "") : content;
      lines.push(`Assistente: ${truncated}`);
      continue;
    }
  }

  const text = lines.join("\n");
  return useLimits ? text.slice(-maxChars) : text;
}
