/**
 * Tool pesquisar_fretes — implementa a lógica do Agente 2 (Pesquisador ES).
 * Recebe query em linguagem natural, extrai parâmetros, resolve geolocalização,
 * busca no Elasticsearch e retorna entre 2 e 15 fretes formatados.
 */

import { tool } from "@langchain/core/tools";
import z from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { agentEnv } from "../config.js";
import { searchFretes, type FreteHit } from "../services/elasticsearch.js";
import { setLastSearch } from "../services/search-cache.js";
import { getThreadId } from "../context.js";
import { log } from "../../../utils/logger.js";
import { resolveLocation } from "./shared/resolve-location.js";

const MIN_FRETES = 2;
const MAX_FRETES = 15;

function buildFreteKey(frete: FreteHit): string {
  if (frete.message_id) return `id:${frete.message_id}`;
  return JSON.stringify([
    frete.carrier_name ?? "",
    frete.origin?.content ?? "",
    frete.destination?.content ?? "",
    frete.price ?? "",
    frete.product_type ?? "",
    frete.timestamp ?? "",
  ]);
}

function mergeFretesUnique(base: FreteHit[], incoming: FreteHit[], max: number): FreteHit[] {
  const merged = [...base];
  const seen = new Set(merged.map(buildFreteKey));
  for (const frete of incoming) {
    const key = buildFreteKey(frete);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(frete);
    if (merged.length >= max) break;
  }
  return merged;
}

interface ExtractedParams {
  origin?: string;
  destination?: string;
  productType?: string;
  carrierName?: string;
  clarificationQuestion?: string;
}

async function extractParamsFromQuery(query: string): Promise<ExtractedParams> {
  log.tool("Extraindo parâmetros da query com LLM...");

  const llm = new ChatOpenAI({
    apiKey: agentEnv.openai.apiKey(),
    model: agentEnv.openai.model(),
    temperature: 0,
  });

  const prompt = `Você extrai parâmetros de pesquisas sobre fretes. REGRAS:

1. **carrierName** (transportadora): G10, TRANSVIDAL, TRANSPANORAMA. "da G10" = transportadora.
2. **productType** (tipo de produto): grãos, farelo, açúcar, etc.
3. **origin/destination**: use APENAS o nome da cidade (ex: "Maringá", "Paranaguá"). NÃO inclua "/PR" ou sufixo de estado.
4. IGNORE menções a tipo de veículo (carreta, caminhão, bitrem) — não extraia esse campo.
5. TRANSCRIÇÃO: se um nome de cidade parecer erro de transcrição (ex: "Dilberaba"), corrija para a cidade mais provável no contexto (ex: Uberaba). Use cidades conhecidas do domínio: Uberaba, Rondonópolis, Rio Verde, Paranaguá, Maringá, Santos, Curitiba.

Pesquisa: "${query}"

Retorne APENAS um JSON válido, sem markdown:
{"origin": "cidade", "destination": "cidade", "productType": "tipo", "carrierName": "transportadora"}

Use null para campos não mencionados.`;

  const response = await llm.invoke([{ role: "user", content: prompt }]);
  const content = typeof response.content === "string" ? response.content : String(response.content);

  try {
    const json = content.replace(/```json?\s*|\s*```/g, "").trim();
    const parsed = JSON.parse(json) as Record<string, string | null>;
    const result: ExtractedParams = {
      origin: parsed.origin && parsed.origin !== "null" ? String(parsed.origin) : undefined,
      destination: parsed.destination && parsed.destination !== "null" ? String(parsed.destination) : undefined,
      productType: parsed.productType && parsed.productType !== "null" ? String(parsed.productType) : undefined,
      carrierName: parsed.carrierName && parsed.carrierName !== "null" ? String(parsed.carrierName) : undefined,
      clarificationQuestion:
        parsed.clarificationQuestion && parsed.clarificationQuestion !== "null"
          ? String(parsed.clarificationQuestion)
          : undefined,
    };
    log.tool("Parâmetros extraídos:", JSON.stringify(result, null, 2));
    return result;
  } catch {
    log.tool("Falha ao parsear JSON, usando fallback vazio");
    return {
      origin: undefined,
      destination: undefined,
      productType: undefined,
      carrierName: undefined,
    };
  }
}

export const pesquisarFretesTool = tool(
  async (input: { query: string }) => {
    const { query } = input;
    log.tool("pesquisar_fretes chamada com query:", query);
    log.info("[pesquisar_fretes] Iniciando tool, query:", query);

    try {
      if (!query || typeof query !== "string") {
        log.tool("Erro: query inválida");
        log.warn("[pesquisar_fretes] Query inválida");
        return "Erro: informe uma pesquisa em linguagem natural (ex: fretes de São Paulo para Curitiba de grãos).";
      }

      log.info("[pesquisar_fretes] Extraindo parâmetros com LLM...");
      const params = await extractParamsFromQuery(query);

      if (params.clarificationQuestion) {
        log.tool("Retornando pergunta de esclarecimento ao usuário");
        return params.clarificationQuestion;
      }

      let originLatLon: { lat: number; lon: number } | undefined;
      let destinationLatLon: { lat: number; lon: number } | undefined;
      let originText: string | undefined;
      let destinationText: string | undefined;
      let originResolved: { name: string; stateUf?: string } | undefined;

      if (params.origin) {
        log.info(`[pesquisar_fretes] Resolvendo origem:`, params.origin);
        const originResult = await resolveLocation(params.origin, "origin", query, undefined);
        if (originResult.clarificationQuestion) {
          log.tool("Retornando pergunta de esclarecimento (origem)");
          return originResult.clarificationQuestion;
        }
        originLatLon = originResult.latLon;
        originText = originResult.text;
        if (originLatLon && params.origin) {
          originResolved = { name: params.origin, stateUf: originResult.stateUf };
        }
      }

      if (params.destination) {
        log.info(`[pesquisar_fretes] Resolvendo destino:`, params.destination);
        const destResult = await resolveLocation(params.destination, "destination", query, originResolved);
        if (destResult.clarificationQuestion) {
          log.tool("Retornando pergunta de esclarecimento (destino)");
          return destResult.clarificationQuestion;
        }
        destinationLatLon = destResult.latLon;
        destinationText = destResult.text;
      }

      log.info("[pesquisar_fretes] Buscando no Elasticsearch...");
      log.tool("Buscando no Elasticsearch...");
      const primaryFretes = await searchFretes({
        originLatLon: originLatLon ? { lat: originLatLon.lat, lon: originLatLon.lon } : undefined,
        destinationLatLon: destinationLatLon
          ? { lat: destinationLatLon.lat, lon: destinationLatLon.lon }
          : undefined,
        originText,
        destinationText,
        productType: params.productType,
        carrierName: params.carrierName,
        limit: MAX_FRETES,
      });

      let fretes = [...primaryFretes];

      // Se vier pouco resultado para rota exata, abre a busca para dar mais opções ao caminhoneiro.
      if (fretes.length < MAX_FRETES && (originLatLon || destinationLatLon || originText || destinationText)) {
        log.info("[pesquisar_fretes] Poucos fretes na rota exata, aplicando fallback progressivo");

        if (fretes.length < MAX_FRETES && (originLatLon || originText) && (destinationLatLon || destinationText)) {
          const byOrigin = await searchFretes({
            originLatLon: originLatLon ? { lat: originLatLon.lat, lon: originLatLon.lon } : undefined,
            originText,
            productType: params.productType,
            carrierName: params.carrierName,
            limit: MAX_FRETES,
          });
          fretes = mergeFretesUnique(fretes, byOrigin, MAX_FRETES);
        }

        if (fretes.length < MAX_FRETES && (originLatLon || originText) && (destinationLatLon || destinationText)) {
          const byDestination = await searchFretes({
            destinationLatLon: destinationLatLon
              ? { lat: destinationLatLon.lat, lon: destinationLatLon.lon }
              : undefined,
            destinationText,
            productType: params.productType,
            carrierName: params.carrierName,
            limit: MAX_FRETES,
          });
          fretes = mergeFretesUnique(fretes, byDestination, MAX_FRETES);
        }

        if (fretes.length < MAX_FRETES) {
          const broad = await searchFretes({
            productType: params.productType,
            carrierName: params.carrierName,
            limit: MAX_FRETES,
          });
          fretes = mergeFretesUnique(fretes, broad, MAX_FRETES);
        }
      }

      if (fretes.length === 0) {
        log.tool("Nenhum frete encontrado");
        log.info("[pesquisar_fretes] Nenhum frete encontrado");
        return `Nenhum frete encontrado para a pesquisa: "${query}". Tente ajustar origem, destino ou filtros.`;
      }

      const slice = fretes.slice(0, Math.min(MAX_FRETES, Math.max(MIN_FRETES, fretes.length)));
      log.tool(`Encontrados ${slice.length} fretes`);
      log.info("[pesquisar_fretes] Encontrados", slice.length, "fretes");

      const threadId = getThreadId();
      if (threadId) {
        await setLastSearch(threadId, {
          fretes: slice,
          rota: { origin: params.origin, destination: params.destination },
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
      log.error("[pesquisar_fretes] Erro:", err instanceof Error ? err.message : String(err));
      console.error("[pesquisar_fretes] Stack:", err instanceof Error ? err.stack : "(sem stack)");
      const msg = err instanceof Error ? err.message : String(err);
      return `Erro ao pesquisar fretes: ${msg}. Verifique Elasticsearch, API de localização e OPENAI_API_KEY.`;
    }
  },
  {
    name: "pesquisar_fretes",
    description: `Pesquisa fretes no banco de dados. Use APENAS quando o usuário informar origem E destino. Se informar só origem ou só destino, use pesquisar_fretes_flexivel. Entrada: descrição em linguagem natural. Retorna JSON com array "fretes" contendo objetos com: carrier_name, origin, destination, price, product_type, vehicle_type, weight_amount, weight_unit, timestamp. Entre ${MIN_FRETES} e ${MAX_FRETES} fretes; se a rota exata tiver poucos resultados, amplia a busca para trazer mais opções. Casos sem fretes (erro, nenhum resultado, pergunta de esclarecimento): retorna string simples.`,
    schema: z.object({
      query: z.string().describe("Pesquisa em linguagem natural, ex: fretes de São Paulo para Curitiba de grãos"),
    }),
  },
);
