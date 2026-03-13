/**
 * Módulo compartilhado para resolução de geolocalização (lat/lon) de cidades e estados.
 * Usado por pesquisar-fretes e pesquisar-fretes-flexivel.
 */

import { ChatOpenAI } from "@langchain/openai";
import { agentEnv } from "../../config.js";
import {
  getCitiesByQuery,
  getCitiesWithCoords,
  getStatesByQuery,
  getStatesMap,
  getStateCoordinates,
} from "../../services/location-api.js";
import { log } from "../../../../utils/logger.js";

type CityWithCoords = Awaited<ReturnType<typeof getCitiesByQuery>>[number] & { lat: number; lon: number };

export interface ResolveCityContext {
  query: string;
  role: "origin" | "destination";
  otherCity?: { name: string; stateUf?: string };
}

export type ResolveCityResult =
  | { lat: number; lon: number; stateUf?: string }
  | { clarificationQuestion: string };

/** Remove sufixo de estado (ex: "Maringá/PR" → "Maringá") para geolocalização funcionar */
export function normalizeLocationName(name: string): string {
  return name.replace(/\s*\/\s*[A-Z]{2}\s*$/i, "").trim();
}

/**
 * Resolve cidade quando há múltiplas com o mesmo nome.
 * Usa LLM para escolher a mais provável com base no contexto (origem/destino, query).
 * Se o LLM não conseguir decidir, retorna pergunta de esclarecimento para o usuário.
 */
export async function resolveCityWithContext(
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

export interface ResolveLocationResult {
  latLon?: { lat: number; lon: number };
  text?: string;
  clarificationQuestion?: string;
  stateUf?: string;
}

/**
 * Resolve uma localização (cidade ou estado) para lat/lon ou texto para busca.
 * Usa API SAG e resolveCityWithContext para desambiguação.
 */
export async function resolveLocation(
  locationName: string,
  role: "origin" | "destination",
  query: string,
  otherCity?: { name: string; stateUf?: string },
): Promise<ResolveLocationResult> {
  const norm = normalizeLocationName(locationName);
  log.tool(`Resolvendo geolocalização ${role === "origin" ? "da origem" : "do destino"}:`, norm);

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
    otherCity,
  });

  if ("clarificationQuestion" in result) {
    return { clarificationQuestion: result.clarificationQuestion };
  }
  log.tool(`${role === "origin" ? "Origem" : "Destino"}: coordenadas encontradas`, result);
  // geo_point do ES aceita APENAS { lat, lon } — stateUf não pode ir no objeto
  return { latLon: { lat: result.lat, lon: result.lon }, stateUf: result.stateUf };
}
