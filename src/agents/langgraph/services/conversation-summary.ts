/**
 * Obtém resumo da conversa a partir do histórico do checkpointer.
 * Usado no payload para o n8n quando o caminhoneiro contrata um frete.
 */

import type { BaseMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { checkpointer } from "../checkpointer.js";
import { agentEnv } from "../config.js";
import { log } from "../../../utils/logger.js";

const MAX_MESSAGES_FOR_SUMMARY = 20;

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
