/**
 * Tool pesquisar_fretes — implementa a lógica do Agente 2 (Pesquisador ES).
 * Recebe query em linguagem natural, extrai parâmetros, resolve geolocalização,
 * busca no Elasticsearch e retorna entre 2 e 15 fretes formatados.
 */

import { tool } from "@langchain/core/tools";
import z from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { agentEnv } from "../config.js";
import { getCityCoordinates, getStateCoordinates } from "../services/location-api.js";
import { searchFretes, type FreteHit } from "../services/elasticsearch.js";
import { log } from "../../../utils/logger.js";

const MIN_FRETES = 2;
const MAX_FRETES = 15;

/** Remove sufixo de estado (ex: "Maringá/PR" → "Maringá") para geolocalização funcionar */
function normalizeLocationName(name: string): string {
  return name.replace(/\s*\/\s*[A-Z]{2}\s*$/i, "").trim();
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

function formatFrete(f: FreteHit, index: number): string {
  const origin = f.origin?.content ?? "N/A";
  const dest = f.destination?.content ?? "N/A";
  const price = f.price != null && f.price >= 0 ? `R$ ${f.price.toFixed(2)}` : "N/A";
  const carrier = f.carrier_name ?? "N/A";
  const product = f.product_type ?? "";
  const vehicle = f.vehicle_type ?? "";
  const publishedAt = formatPublicationDate(f.timestamp);
  const vehicleInfo = vehicle && vehicle !== "UNKNOWN" ? ` | ${vehicle}` : "";
  const productInfo = product ? ` | ${product}` : "";
  return `${index + 1}. Origem: ${origin} → Destino: ${dest} | ${price} | Transportador: ${carrier} | Publicado: ${publishedAt}${productInfo}${vehicleInfo}`;
}

export const pesquisarFretesTool = tool(
  async (input: { query: string }) => {
    const { query } = input;
    log.tool("pesquisar_fretes chamada com query:", query);

    if (!query || typeof query !== "string") {
      log.tool("Erro: query inválida");
      return "Erro: informe uma pesquisa em linguagem natural (ex: fretes de São Paulo para Curitiba de grãos).";
    }

    const params = await extractParamsFromQuery(query);

    if (params.clarificationQuestion) {
      log.tool("Retornando pergunta de esclarecimento ao usuário");
      return params.clarificationQuestion;
    }

    let originLatLon: { lat: number; lon: number } | undefined;
    let destinationLatLon: { lat: number; lon: number } | undefined;
    let originText: string | undefined;
    let destinationText: string | undefined;

    if (params.origin) {
      const originNorm = normalizeLocationName(params.origin);
      log.tool("Resolvendo geolocalização da origem:", originNorm);
      originLatLon = await getCityCoordinates(originNorm) ?? await getStateCoordinates(originNorm) ?? undefined;
      if (!originLatLon) {
        originText = originNorm;
        log.tool("Origem: usando busca por texto (sem lat/long)");
      } else {
        log.tool("Origem: coordenadas encontradas", originLatLon);
      }
    }
    if (params.destination) {
      const destNorm = normalizeLocationName(params.destination);
      log.tool("Resolvendo geolocalização do destino:", destNorm);
      destinationLatLon = await getCityCoordinates(destNorm) ?? await getStateCoordinates(destNorm) ?? undefined;
      if (!destinationLatLon) {
        destinationText = destNorm;
        log.tool("Destino: usando busca por texto (sem lat/long)");
      } else {
        log.tool("Destino: coordenadas encontradas", destinationLatLon);
      }
    }

    log.tool("Buscando no Elasticsearch...");
    const fretes = await searchFretes({
      originLatLon,
      destinationLatLon,
      originText,
      destinationText,
      productType: params.productType,
      carrierName: params.carrierName,
      limit: MAX_FRETES,
    });

    if (fretes.length === 0) {
      log.tool("Nenhum frete encontrado");
      return `Nenhum frete encontrado para a pesquisa: "${query}". Tente ajustar origem, destino ou filtros.`;
    }

    const slice = fretes.slice(0, Math.max(MIN_FRETES, fretes.length));
    log.tool(`Encontrados ${slice.length} fretes`);
    const formatted = slice.map((f, i) => formatFrete(f, i)).join("\n");
    return `Encontrados ${slice.length} fretes:\n\n${formatted}`;
  },
  {
    name: "pesquisar_fretes",
    description: `Pesquisa fretes no banco de dados. Use quando o usuário pedir fretes, cargas ou preços de transporte. Entrada: descrição em linguagem natural. Exemplos: "fretes de São Paulo para Curitiba de grãos", "fretes de Maringá até Paranaguá da G10" (G10 = transportadora). Retorna entre ${MIN_FRETES} e ${MAX_FRETES} fretes com origem, destino, preço, transportador e data de publicação. Sempre inclua a data de publicação ao apresentar os resultados ao usuário.`,
    schema: z.object({
      query: z.string().describe("Pesquisa em linguagem natural, ex: fretes de São Paulo para Curitiba de grãos"),
    }),
  },
);
