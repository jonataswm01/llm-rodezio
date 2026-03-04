/**
 * Tool pesquisar_fretes — implementa a lógica do Agente 2 (Pesquisador ES).
 * Recebe query em linguagem natural, extrai parâmetros, resolve geolocalização,
 * busca no Elasticsearch e retorna entre 2 e 15 fretes formatados.
 */

import { tool } from "@langchain/core/tools";
import z from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { agentEnv } from "../config.js";
import {
  getCitiesByQuery,
  getCitiesWithCoords,
  getStatesByQuery,
  getStatesMap,
  getStateCoordinates,
} from "../services/location-api.js";
import { searchFretes, type FreteHit } from "../services/elasticsearch.js";
import { log } from "../../../utils/logger.js";

type CityWithCoords = Awaited<ReturnType<typeof getCitiesByQuery>>[number] & { lat: number; lon: number };

const MIN_FRETES = 2;
const MAX_FRETES = 15;

/** Remove sufixo de estado (ex: "Maringá/PR" → "Maringá") para geolocalização funcionar */
function normalizeLocationName(name: string): string {
  return name.replace(/\s*\/\s*[A-Z]{2}\s*$/i, "").trim();
}

interface ResolveCityContext {
  query: string;
  role: "origin" | "destination";
  otherCity?: { name: string; stateUf?: string };
}

type ResolveCityResult =
  | { lat: number; lon: number; stateUf?: string }
  | { clarificationQuestion: string };

/**
 * Resolve cidade quando há múltiplas com o mesmo nome.
 * Usa LLM para escolher a mais provável com base no contexto (origem/destino, query).
 * Se o LLM não conseguir decidir, retorna pergunta de esclarecimento para o usuário.
 */
async function resolveCityWithContext(
  cityName: string,
  citiesWithCoords: CityWithCoords[],
  context: ResolveCityContext,
): Promise<ResolveCityResult> {
  if (citiesWithCoords.length === 0) {
    return { clarificationQuestion: `Nenhuma cidade encontrada para "${cityName}".` };
  }

  const statesMap = await getStatesMap();

  if (citiesWithCoords.length === 1) {
    const c = citiesWithCoords[0];
    const state = c.stateId ? statesMap.get(c.stateId) : null;
    return { lat: c.lat, lon: c.lon, stateUf: state?.uf };
  }
  const options = citiesWithCoords.map((c, i) => {
    const state = c.stateId ? statesMap.get(c.stateId) : null;
    const uf = state?.uf ?? state?.name?.slice(0, 2) ?? undefined;
    return { index: i + 1, name: c.name, uf, lat: c.lat, lon: c.lon };
  });

  log.tool(`[resolveCity] ${cityName}: ${options.length} cidades, consultando LLM para desambiguar`);

  const llm = new ChatOpenAI({
    apiKey: agentEnv.openai.apiKey(),
    model: agentEnv.openai.model(),
    temperature: 0,
  });

  const optionsDesc = options
    .map((o) => `${o.index}. ${o.name}${o.uf ? `-${o.uf}` : ""} (lat: ${o.lat}, lon: ${o.lon})`)
    .join("\n");

  const prompt = `Você ajuda a desambiguar cidades brasileiras em pesquisas de fretes.

CONTEXTO:
- Pesquisa do usuário: "${context.query}"
- Cidade a resolver: "${cityName}" (${context.role === "origin" ? "origem" : "destino"})
${context.otherCity ? `- ${context.role === "origin" ? "Destino" : "Origem"} já informado: ${context.otherCity.name}${context.otherCity.stateUf ? ` (${context.otherCity.stateUf})` : ""}` : ""}

OPÇÕES ENCONTRADAS (várias cidades com o mesmo nome):
${optionsDesc}

REGRAS:
1. Considere o contexto da pesquisa. Ex: "Barretos para Santos" — Barretos fica em SP; Santos-SP é o principal porto do Brasil e faz mais sentido para fretes que Santos-PB.
2. Cidades mais conhecidas (portos, capitais, grandes centros) tendem a ser a escolha correta em contexto de fretes.
3. Se origem e destino estão no mesmo estado ou região, priorize cidades da mesma região.
4. Só retorne clarificationNeeded: true se NÃO conseguir decidir com confiança (ex: pouca informação, cidades igualmente plausíveis).

Retorne APENAS um JSON válido, sem markdown:
{"selectedIndex": número de 1 a ${options.length}} OU {"clarificationNeeded": true}

Se clarificationNeeded for true, o sistema perguntará ao usuário qual cidade ele quer.`;

  const response = await llm.invoke([{ role: "user", content: prompt }]);
  const content = typeof response.content === "string" ? response.content : String(response.content);

  try {
    const json = content.replace(/```json?\s*|\s*```/g, "").trim();
    const parsed = JSON.parse(json) as { selectedIndex?: number; clarificationNeeded?: boolean };

    if (parsed.clarificationNeeded) {
      const optionsText = options.map((o) => `${o.index}) ${o.name}${o.uf ? `-${o.uf}` : ""}`).join(", ");
      log.tool(`[resolveCity] LLM não conseguiu decidir, perguntando ao usuário`);
      return {
        clarificationQuestion: `Encontramos várias cidades chamadas "${cityName}". Qual você quer? ${optionsText}\n\nResponda com o número (ex: 1) ou o nome completo com estado (ex: Santos-SP).`,
      };
    }

    const idx = parsed.selectedIndex;
    if (typeof idx !== "number" || idx < 1 || idx > options.length) {
      log.tool(`[resolveCity] Índice inválido (${idx}), usando primeira opção`);
      const first = options[0];
      return { lat: first.lat, lon: first.lon, stateUf: first.uf };
    }

    const chosen = options[idx - 1];
    log.tool(`[resolveCity] LLM escolheu: ${chosen.name}${chosen.uf ? `-${chosen.uf}` : ""} (índice ${idx})`);
    return { lat: chosen.lat, lon: chosen.lon, stateUf: chosen.uf };
  } catch {
    log.tool("[resolveCity] Falha ao parsear resposta do LLM, usando primeira opção");
    const first = options[0];
    return { lat: first.lat, lon: first.lon, stateUf: first.uf };
  }
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

/** Formata timestamp para exibição (ex: "02/03/2025" ou "2 de mar 2025") */
function formatPublicationDate(ts?: string): string {
  if (!ts) return "N/A";
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "N/A";
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "N/A";
  }
}

function formatFrete(f: FreteHit): string {
  const origin = f.origin?.content ?? "N/A";
  const dest = f.destination?.content ?? "N/A";
  const price = f.price != null && f.price >= 0 ? `R$ ${f.price.toFixed(2)}` : "N/A";
  const carrier = f.carrier_name ?? "N/A";
  const product = f.product_type ?? "";
  const vehicle = f.vehicle_type ?? "";
  const publishedAt = formatPublicationDate(f.timestamp);
  const vehicleInfo = vehicle && vehicle !== "UNKNOWN" ? ` | ${vehicle}` : "";
  const productInfo = product ? ` | ${product}` : "";
  return `• ${origin} → ${dest} | ${price} | ${carrier} | ${publishedAt}${productInfo}${vehicleInfo}`;
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

      const resolveLocation = async (
        locationName: string,
        role: "origin" | "destination",
      ): Promise<{
        latLon?: { lat: number; lon: number };
        text?: string;
        clarificationQuestion?: string;
        stateUf?: string;
      }> => {
        const norm = normalizeLocationName(locationName);
        log.tool(`Resolvendo geolocalização ${role === "origin" ? "da origem" : "do destino"}:`, norm);
        log.info(`[pesquisar_fretes] Resolvendo ${role}:`, norm);

        const cities = await getCitiesByQuery({ q: norm });
        const withCoords = getCitiesWithCoords(cities);

        if (withCoords.length === 0) {
          const stateCoords = await getStateCoordinates(norm);
          if (stateCoords) {
            const states = await getStatesByQuery(norm);
            const stateUf = states[0]?.uf;
            log.tool(`${role === "origin" ? "Origem" : "Destino"}: coordenadas do estado encontradas`, stateCoords);
            return { latLon: stateCoords, stateUf };
          }
          log.tool(`${role === "origin" ? "Origem" : "Destino"}: usando busca por texto (sem lat/long)`);
          return { text: norm };
        }

        const result = await resolveCityWithContext(norm, withCoords, {
          query,
          role,
          otherCity: originResolved,
        });

        if ("clarificationQuestion" in result) {
          return { clarificationQuestion: result.clarificationQuestion };
        }
        log.tool(`${role === "origin" ? "Origem" : "Destino"}: coordenadas encontradas`, result);
        return { latLon: result, stateUf: result.stateUf };
      };

      if (params.origin) {
        const originResult = await resolveLocation(params.origin, "origin");
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
        const destResult = await resolveLocation(params.destination, "destination");
        if (destResult.clarificationQuestion) {
          log.tool("Retornando pergunta de esclarecimento (destino)");
          return destResult.clarificationQuestion;
        }
        destinationLatLon = destResult.latLon;
        destinationText = destResult.text;
      }

      log.info("[pesquisar_fretes] Buscando no Elasticsearch...");
      log.tool("Buscando no Elasticsearch...");
      const fretes = await searchFretes({
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

      if (fretes.length === 0) {
        log.tool("Nenhum frete encontrado");
        log.info("[pesquisar_fretes] Nenhum frete encontrado");
        return `Nenhum frete encontrado para a pesquisa: "${query}". Tente ajustar origem, destino ou filtros.`;
      }

      const slice = fretes.slice(0, Math.max(MIN_FRETES, fretes.length));
      log.tool(`Encontrados ${slice.length} fretes`);
      log.info("[pesquisar_fretes] Encontrados", slice.length, "fretes");
      const formatted = slice.map((f) => formatFrete(f)).join("\n");
      return `Encontrados ${slice.length} fretes:\n\n${formatted}`;
    } catch (err) {
      log.error("[pesquisar_fretes] Erro:", err instanceof Error ? err.message : String(err));
      console.error("[pesquisar_fretes] Stack:", err instanceof Error ? err.stack : "(sem stack)");
      const msg = err instanceof Error ? err.message : String(err);
      return `Erro ao pesquisar fretes: ${msg}. Verifique Elasticsearch, API de localização e OPENAI_API_KEY.`;
    }
  },
  {
    name: "pesquisar_fretes",
    description: `Pesquisa fretes no banco de dados. Use quando o usuário pedir fretes, cargas ou preços de transporte. Entrada: descrição em linguagem natural. Exemplos: "fretes de São Paulo para Curitiba de grãos", "fretes de Maringá até Paranaguá da G10" (G10 = transportadora). Retorna entre ${MIN_FRETES} e ${MAX_FRETES} fretes com origem, destino, preço, transportador e data de publicação. Sempre inclua a data de publicação ao apresentar os resultados ao usuário.`,
    schema: z.object({
      query: z.string().describe("Pesquisa em linguagem natural, ex: fretes de São Paulo para Curitiba de grãos"),
    }),
  },
);
