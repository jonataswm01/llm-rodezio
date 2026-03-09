/**
 * Tool contratar_frete — quando o caminhoneiro manifesta intenção de contratar um frete,
 * chama o webhook n8n com os dados e retorna mensagem fixa.
 * O freteIndex (1, 2, 3...) vem do LLM — indica qual frete da lista o usuário escolheu.
 * O frete real (com ID/message_id) vem do cache da última pesquisa.
 */

import { tool } from "@langchain/core/tools";
import z from "zod";
import { getThreadId } from "../context.js";
import { getLastSearch } from "../services/search-cache.js";
import { getConversationSummary } from "../services/conversation-summary.js";
import { notifyContratarFrete } from "../services/n8n-client.js";
import { log } from "../../../utils/logger.js";

const SUCCESS_MESSAGE =
  "Entrei em contato com o embarcador responsável por esse frete. Em alguns minutos ele deve entrar em contato com você.";

const CACHE_EMPTY_MESSAGE =
  "Pesquise fretes antes de contratar. Diga a rota que você quer (ex: fretes de São Paulo para Curitiba).";

const INDEX_INVALID_MESSAGE =
  "Não encontrei esse frete na lista. Qual número da lista você quer? (1, 2, 3...)";

const N8N_ERROR_MESSAGE =
  "Tive um problema ao enviar sua solicitação. Tente novamente em alguns minutos.";

export const contratarFreteTool = tool(
  async (input: { freteIndex: number }) => {
    const { freteIndex } = input;
    log.tool("contratar_frete chamada com freteIndex:", freteIndex);

    const threadId = getThreadId();
    if (!threadId) {
      log.warn("[contratar_frete] Sem threadId no contexto");
      return CACHE_EMPTY_MESSAGE;
    }

    const cached = await getLastSearch(threadId);
    if (!cached || !cached.fretes?.length) {
      log.tool("Cache vazio ou expirado");
      return CACHE_EMPTY_MESSAGE;
    }

    const index = Math.floor(freteIndex);
    if (index < 1 || index > cached.fretes.length) {
      log.tool("Índice inválido:", freteIndex, "máx:", cached.fretes.length);
      return INDEX_INVALID_MESSAGE;
    }

    const frete = cached.fretes[index - 1] as Record<string, unknown>;
    const rota = cached.rota ?? {};

    let resumoConversa = "";
    try {
      resumoConversa = await getConversationSummary(threadId);
    } catch (err) {
      log.warn("[contratar_frete] Erro ao obter resumo:", err instanceof Error ? err.message : String(err));
    }

    const messageId = frete.message_id as string | undefined;
    const remoteJidEmbarcador =
      (frete.remoteJid_embarcador as string | undefined) ?? (frete.remote_jid as string | undefined);

    const payload = {
      messageId,
      remoteJidEmbarcador,
      rota: {
        origem: rota.origin,
        destino: rota.destination,
      },
      frete: { ...frete },
      resumoConversa: resumoConversa || "Conversa não disponível.",
      dadosUsuario: { remoteJid: threadId },
    };

    try {
      await notifyContratarFrete(payload);
      log.info("[contratar_frete] Webhook n8n chamado com sucesso");
      return SUCCESS_MESSAGE;
    } catch (err) {
      log.error("[contratar_frete] Erro ao chamar n8n:", err instanceof Error ? err.message : String(err));
      return N8N_ERROR_MESSAGE;
    }
  },
  {
    name: "contratar_frete",
    description: `Use quando o caminhoneiro demonstrar intenção de contratar/pegar um frete (ex: "quero esse", "quero o segundo", "me interessa o de X para Y", "quero contratar"). Passe o índice do frete na lista mostrada (1 = primeiro, 2 = segundo, etc). Só use após ter mostrado fretes com pesquisar_fretes.`,
    schema: z.object({
      freteIndex: z
        .number()
        .int()
        .min(1)
        .max(15)
        .describe("Índice do frete na lista (1-based). Ex: 1 = primeiro, 2 = segundo."),
    }),
  },
);
