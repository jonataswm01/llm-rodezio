/**
 * Tool cotacao_frete — quando o usuário manifesta intenção de cotação de frete,
 * chama o webhook n8n frete-cotacao com resumo, número, hora e dados da cotação (se tiver).
 * Depois o agente direciona a pessoa a entrar em contato com o Jonatas no (16) 99733-0113.
 */

import { tool } from "@langchain/core/tools";
import z from "zod";
import { getThreadId } from "../context.js";
import { getConversationSummary } from "../services/conversation-summary.js";
import { notifyFreteCotacao } from "../services/n8n-client.js";
import { log } from "../../../utils/logger.js";

const CONTACT_MESSAGE = "Para cotação de frete, entre em contato com o Jonatas no (16) 99733-0113.";

const dadosCotacaoSchema = z
  .object({
    origem: z.string().optional().describe("Origem da cotação, se mencionada"),
    destino: z.string().optional().describe("Destino da cotação, se mencionado"),
    tipoCarga: z.string().optional().describe("Tipo de carga, se mencionado"),
  })
  .optional();

export const cotacaoFreteTool = tool(
  async (input: { dadosCotacao?: { origem?: string; destino?: string; tipoCarga?: string } }) => {
    const { dadosCotacao } = input;
    log.tool("cotacao_frete chamada com dadosCotacao:", dadosCotacao);

    const threadId = getThreadId();
    if (!threadId) {
      log.warn("[cotacao_frete] Sem threadId no contexto");
      return CONTACT_MESSAGE;
    }

    let resumoConversa = "";
    try {
      resumoConversa = await getConversationSummary(threadId);
    } catch (err) {
      log.warn("[cotacao_frete] Erro ao obter resumo:", err instanceof Error ? err.message : String(err));
    }

    const payload = {
      resumoConversa: resumoConversa || "Conversa não disponível.",
      numeroPessoa: threadId,
      hora: new Date().toISOString(),
      ...(dadosCotacao &&
        (dadosCotacao.origem || dadosCotacao.destino || dadosCotacao.tipoCarga) && {
          dadosCotacao: {
            ...(dadosCotacao.origem && { origem: dadosCotacao.origem }),
            ...(dadosCotacao.destino && { destino: dadosCotacao.destino }),
            ...(dadosCotacao.tipoCarga && { tipoCarga: dadosCotacao.tipoCarga }),
          },
        }),
    };

    try {
      await notifyFreteCotacao(payload);
      log.info("[cotacao_frete] Webhook n8n chamado com sucesso");
      return CONTACT_MESSAGE;
    } catch (err) {
      log.error("[cotacao_frete] Erro ao chamar n8n:", err instanceof Error ? err.message : String(err));
      return CONTACT_MESSAGE;
    }
  },
  {
    name: "cotacao_frete",
    description: `Use quando o usuário demonstrar intenção de COTAÇÃO de frete (ex: "quero cotar", "preciso de cotação", "quanto custa frete de X para Y", "quero uma cotação"). Passe dadosCotacao apenas se o usuário mencionou origem, destino ou tipo de carga — se não mencionou, não passe nada e não pergunte.`,
    schema: z.object({
      dadosCotacao: dadosCotacaoSchema,
    }),
  },
);
