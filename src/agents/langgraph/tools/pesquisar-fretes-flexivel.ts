/**
 * Tool pesquisar_fretes_flexivel — busca fretes por APENAS origem OU APENAS destino.
 * Usada quando o usuário informa só um lado da rota (ex: "tem frete para Santos?", "o que tem saindo de Maringá?").
 * NUNCA pergunta o que falta — faz a busca com o que foi informado.
 */

import { tool } from "@langchain/core/tools";
import z from "zod";
import { searchFretesPartial } from "../services/elasticsearch.js";
import { setLastSearch } from "../services/search-cache.js";
import { getThreadId } from "../context.js";
import { resolveLocation } from "./shared/resolve-location.js";
import { log } from "../../../utils/logger.js";

const MIN_FRETES = 2;
const MAX_FRETES = 15;

export const pesquisarFretesFlexivelTool = tool(
  async (input: {
    modo: "origem" | "destino";
    localizacao: string;
    productType?: string;
    carrierName?: string;
  }) => {
    const { modo, localizacao, productType, carrierName } = input;
    log.tool("pesquisar_fretes_flexivel chamada com:", { modo, localizacao, productType, carrierName });
    log.info("[pesquisar_fretes_flexivel] Iniciando tool", { modo, localizacao });

    try {
      if (!localizacao || typeof localizacao !== "string" || !localizacao.trim()) {
        log.tool("Erro: localizacao inválida");
        return "Erro: informe a cidade ou estado para buscar (ex: Santos, Maringá, SP).";
      }

      const role = modo === "origem" ? "origin" : "destination";
      log.info("[pesquisar_fretes_flexivel] Resolvendo geolocalização:", localizacao);
      const resolved = await resolveLocation(localizacao.trim(), role, localizacao, undefined);

      if (resolved.clarificationQuestion) {
        log.tool("Retornando pergunta de esclarecimento ao usuário");
        return resolved.clarificationQuestion;
      }

      const latLon = resolved.latLon;
      const text = resolved.text;

      if (!latLon && !text) {
        log.tool("Nenhuma coordenada ou texto obtido");
        return `Não consegui localizar "${localizacao}". Tente informar a cidade ou estado de outra forma.`;
      }

      log.info("[pesquisar_fretes_flexivel] Buscando no Elasticsearch...");
      const fretes = await searchFretesPartial({
        mode: role,
        latLon,
        text,
        productType,
        carrierName,
        limit: MAX_FRETES,
      });

      if (fretes.length === 0) {
        log.tool("Nenhum frete encontrado");
        return `Nenhum frete encontrado para ${modo === "origem" ? "origem" : "destino"} em "${localizacao}". Tente ajustar o filtro.`;
      }

      const slice = fretes.slice(0, Math.min(MAX_FRETES, Math.max(MIN_FRETES, fretes.length)));
      log.tool(`Encontrados ${slice.length} fretes`);
      log.info("[pesquisar_fretes_flexivel] Encontrados", slice.length, "fretes");

      const threadId = getThreadId();
      if (threadId) {
        await setLastSearch(threadId, {
          fretes: slice,
          rota:
            modo === "origem"
              ? { origin: localizacao.trim(), destination: undefined }
              : { origin: undefined, destination: localizacao.trim() },
        });
      }

      const fretesJson = slice.map((f) => ({
        carrier_name: f.carrier_name ?? null,
        origin: f.origin?.content ?? null,
        destination: f.destination?.content ?? null,
        price: f.price ?? null,
        product_type: f.product_type ?? null,
        vehicle_type: f.vehicle_type ?? null,
        weight_amount: f.weight_amount ?? null,
        weight_unit: f.weight_unit ?? null,
        timestamp: f.timestamp ?? null,
      }));
      return JSON.stringify({ fretes: fretesJson });
    } catch (err) {
      log.error("[pesquisar_fretes_flexivel] Erro:", err instanceof Error ? err.message : String(err));
      console.error("[pesquisar_fretes_flexivel] Stack:", err instanceof Error ? err.stack : "(sem stack)");
      const msg = err instanceof Error ? err.message : String(err);
      return `Erro ao pesquisar fretes: ${msg}. Verifique Elasticsearch, API de localização e OPENAI_API_KEY.`;
    }
  },
  {
    name: "pesquisar_fretes_flexivel",
    description: `Use quando o usuário pedir fretes com APENAS origem OU APENAS destino. DESTINO: "pra/para X", "indo pra X", "com destino em X", "até X", "tem frete pra X?". ORIGEM: "de X", "saindo de X", "o que tem de X?", "fretes de X" (X=cidade). "O que tem de SP?"=origem. "O que tem pra SP?"=destino. "Fretes de grãos"=productType, não origem. localizacao: cidade ou estado. MT→Cuiabá (não Rio Verde=GO). NUNCA pergunte o que falta. productType e carrierName opcionais.`,
    schema: z.object({
      modo: z.enum(["origem", "destino"]).describe("origem = busca fretes saindo do lugar; destino = busca fretes indo para o lugar"),
      localizacao: z.string().describe("Nome da cidade ou estado (ex: Santos, Maringá, SP). Já expandido: Baixada→Santos, MT→Rio Verde"),
      productType: z.string().optional().describe("Tipo de carga se mencionado (ex: grãos, farelo)"),
      carrierName: z.string().optional().describe("Transportadora se mencionada (ex: G10)"),
    }),
  },
);
