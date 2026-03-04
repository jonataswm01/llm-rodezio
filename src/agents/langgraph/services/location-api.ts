/**
 * Cliente HTTP para a API de localização (sag-backend).
 * Usado para resolver lat/long de estados e cidades brasileiras.
 *
 * Regra: enviar apenas parâmetros que o usuário solicitar explicitamente.
 */

import { agentEnv } from "../config.js";
import { log } from "../../../utils/logger.js";

const BASE_URL = agentEnv.sagBackend.url();

export interface StateResult {
  id: string;
  name: string;
  uf?: string;
  region?: string;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lon?: number;
  lng?: number;
  ibgeCode?: string;
}

export interface CityResult {
  id: string;
  name: string;
  ibgeCode?: string;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lon?: number;
  lng?: number;
  ddd?: string;
  timezone?: string;
  isCapital?: boolean;
  stateId?: string;
}

function extractCoords(obj: { latitude?: number; longitude?: number; lat?: number; lon?: number; lng?: number }): { lat: number; lon: number } | null {
  const lat = obj.latitude ?? obj.lat;
  const lon = obj.longitude ?? obj.lon ?? obj.lng;
  if (lat != null && lon != null && typeof lat === "number" && typeof lon === "number") {
    return { lat, lon };
  }
  return null;
}

/** Estrutura real da API sag-backend: data.result contém o array */
interface SagApiResponse<T> {
  data?: {
    result?: T[];
    data?: T[];
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      log.error("[Location API] HTTP", res.status, res.statusText, "—", url);
      throw new Error(`Location API error: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof Error && err.message.includes("Location API error")) throw err;
    log.error("[Location API] Erro ao buscar:", url, "—", err instanceof Error ? err.message : String(err));
    throw err;
  }
}

/**
 * Busca estados por nome (busca parcial, case-insensitive).
 * Envia apenas o parâmetro q quando fornecido.
 */
export async function getStatesByQuery(q: string): Promise<StateResult[]> {
  const params = new URLSearchParams();
  params.set("q", q);
  const url = `${BASE_URL}/v1/location/states?${params.toString()}`;
  log.debug("Location API: GET", url);
  const resp = await fetchJson<SagApiResponse<StateResult>>(url);
  const results = resp.data?.result ?? resp.data?.data ?? [];
  log.debug(`Location API: ${results.length} estados encontrados para "${q}"`);
  return results;
}

/**
 * Lista todos os estados (primeira página).
 */
export async function listStates(page = 1): Promise<StateResult[]> {
  const params = new URLSearchParams();
  params.set("page", String(page));
  const url = `${BASE_URL}/v1/location/states?${params.toString()}`;
  const resp = await fetchJson<SagApiResponse<StateResult>>(url);
  return resp.data?.result ?? resp.data?.data ?? [];
}

/**
 * Busca cidades por nome, opcionalmente filtrado por estado.
 * stateId e q são enviados apenas quando fornecidos.
 */
export async function getCitiesByQuery(
  options: { stateId?: string; q?: string; page?: number } = {},
): Promise<CityResult[]> {
  const params = new URLSearchParams();
  if (options.stateId) params.set("stateId", options.stateId);
  if (options.q) params.set("q", options.q);
  if (options.page && options.page > 1) params.set("page", String(options.page));
  const query = params.toString();
  const url = query ? `${BASE_URL}/v1/location/cities?${query}` : `${BASE_URL}/v1/location/cities`;
  log.debug("Location API: GET", url);
  const resp = await fetchJson<SagApiResponse<CityResult>>(url);
  const results = resp.data?.result ?? resp.data?.data ?? [];
  log.debug(`Location API: ${results.length} cidades encontradas`);
  return results;
}

/**
 * Obtém coordenadas (lat, lon) de um estado pelo nome.
 * Retorna o primeiro resultado da busca.
 */
export async function getStateCoordinates(stateName: string): Promise<{ lat: number; lon: number } | null> {
  const states = await getStatesByQuery(stateName);
  const state = states[0];
  if (!state) return null;
  return extractCoords(state);
}

/**
 * Obtém coordenadas (lat, lon) de uma cidade.
 * Se stateId for fornecido, busca apenas no estado; senão, busca em todo o Brasil.
 * @deprecated Prefira resolveCityWithContext em pesquisar-fretes quando há ambiguidade.
 */
export async function getCityCoordinates(
  cityName: string,
  stateId?: string,
): Promise<{ lat: number; lon: number } | null> {
  const cities = await getCitiesByQuery({ q: cityName, stateId });
  const city = cities[0];
  if (!city) return null;
  return extractCoords(city);
}

/** Cache do mapa estado ID → dados do estado (para enriquecer cidades com UF) */
let statesMapCache: Map<string, StateResult> | null = null;

/**
 * Retorna mapa stateId → StateResult para resolver nomes de estados.
 */
export async function getStatesMap(): Promise<Map<string, StateResult>> {
  if (statesMapCache) return statesMapCache;
  const states = await listStates(1);
  statesMapCache = new Map(states.map((s) => [s.id, s]));
  return statesMapCache;
}

/**
 * Retorna todas as cidades que possuem coordenadas, para resolução com LLM quando há múltiplas.
 */
export function getCitiesWithCoords(cities: CityResult[]): Array<CityResult & { lat: number; lon: number }> {
  const result: Array<CityResult & { lat: number; lon: number }> = [];
  for (const c of cities) {
    const coords = extractCoords(c);
    if (coords) result.push({ ...c, ...coords });
  }
  return result;
}
