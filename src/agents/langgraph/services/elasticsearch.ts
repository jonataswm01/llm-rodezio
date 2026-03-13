/**
 * Cliente Elasticsearch para busca de fretes no index "fretes".
 * Ordenação: mais recentes (timestamp desc) + maior preço (price desc).
 */

import { Client } from "@elastic/elasticsearch";
import { agentEnv } from "../config.js";
import { log } from "../../../utils/logger.js";

function createClient(): Client {
  const url = agentEnv.elasticsearch.url();
  const username = agentEnv.elasticsearch.username();
  const password = agentEnv.elasticsearch.password();

  const config: ConstructorParameters<typeof Client>[0] = {
    node: url,
  };

  if (username && password) {
    config.auth = { username, password };
  }

  return new Client(config);
}

const client = createClient();

const INDEX = agentEnv.elasticsearch.indexFretes();

export interface FreteHit {
  carrier_name?: string;
  origin?: { content?: string; location?: { lat: number; lon: number } };
  destination?: { content?: string; location?: { lat: number; lon: number } };
  price?: number;
  product_type?: string;
  vehicle_type?: string;
  weight_amount?: number;
  weight_unit?: string;
  timestamp?: string;
  message_id?: string;
  remote_jid?: string;
  remoteJid_embarcador?: string;
}

export interface SearchFretesParams {
  originLatLon?: { lat: number; lon: number };
  destinationLatLon?: { lat: number; lon: number };
  originText?: string;
  destinationText?: string;
  productType?: string;
  carrierName?: string;
  limit?: number;
}

export interface SearchFretesPartialParams {
  mode: "origin" | "destination";
  latLon?: { lat: number; lon: number };
  text?: string;
  productType?: string;
  carrierName?: string;
  limit?: number;
}

/**
 * Busca fretes no index com os filtros fornecidos.
 * Ordena por timestamp desc, price desc.
 * Retorna entre 2 e 15 resultados (default 15).
 */
export async function searchFretes(params: SearchFretesParams): Promise<FreteHit[]> {
  const limit = Math.min(Math.max(params.limit ?? 15, 2), 15);
  const geoRadiusKm = agentEnv.elasticsearch.geoRadiusKm();
  const distance = `${geoRadiusKm}km`;
  log.debug(`ES: buscando fretes (limit=${limit}, raio=${distance})`, params);

  const must: object[] = [];

  if (params.originLatLon) {
    must.push({
      geo_distance: {
        distance,
        "origin.location": params.originLatLon,
      },
    });
  }
  if (params.destinationLatLon) {
    must.push({
      geo_distance: {
        distance,
        "destination.location": params.destinationLatLon,
      },
    });
  }
  if (params.originText) {
    must.push({
      match: {
        "origin.content": params.originText,
      },
    });
  }
  if (params.destinationText) {
    must.push({
      match: {
        "destination.content": params.destinationText,
      },
    });
  }
  if (params.productType) {
    must.push({
      wildcard: {
        product_type: {
          value: `*${params.productType}*`,
          case_insensitive: true,
        },
      },
    });
  }
  if (params.carrierName) {
    must.push({
      prefix: {
        carrier_name: {
          value: params.carrierName,
          case_insensitive: true,
        },
      },
    });
  }

  const body: Record<string, unknown> = {
    size: limit,
    sort: [{ timestamp: "desc" }, { price: "desc" }],
  };

  if (must.length > 0) {
    body.query = { bool: { must } };
  } else {
    body.query = { match_all: {} };
  }

  log.debug("ES: query", JSON.stringify(body.query, null, 2));

  try {
    log.info("[Elasticsearch] Executando busca no index:", INDEX);
    const response = await client.search<FreteHit>({
      index: INDEX,
      body,
    });

    const hits = response.hits.hits ?? [];
    const results = hits.map((h) => h._source).filter((s): s is FreteHit => s != null);
    log.info("[Elasticsearch] Encontrados", results.length, "fretes");
    log.debug(`ES: ${results.length} fretes encontrados`);
    return results;
  } catch (err) {
    log.error("[Elasticsearch] Erro na busca:", err instanceof Error ? err.message : String(err));
    console.error("[Elasticsearch] Stack:", err instanceof Error ? err.stack : "(sem stack)");
    throw err;
  }
}

/**
 * Busca fretes por APENAS origem OU APENAS destino (pesquisa parcial).
 * Queries pré-montadas: filtro em origin ou destination conforme o mode.
 * Requer latLon ou text (pelo menos um).
 */
export async function searchFretesPartial(params: SearchFretesPartialParams): Promise<FreteHit[]> {
  const limit = Math.min(Math.max(params.limit ?? 15, 2), 15);
  const geoRadiusKm = agentEnv.elasticsearch.geoRadiusKm();
  const distance = `${geoRadiusKm}km`;

  if (!params.latLon && !params.text) {
    throw new Error("searchFretesPartial requer latLon ou text");
  }

  log.debug(`ES: buscando fretes parcial (mode=${params.mode}, limit=${limit})`, params);

  const must: object[] = [];

  if (params.latLon) {
    const field = params.mode === "origin" ? "origin.location" : "destination.location";
    must.push({
      geo_distance: {
        distance,
        [field]: params.latLon,
      },
    });
  } else if (params.text) {
    const field = params.mode === "origin" ? "origin.content" : "destination.content";
    must.push({
      match: {
        [field]: params.text,
      },
    });
  }

  if (params.productType) {
    must.push({
      wildcard: {
        product_type: {
          value: `*${params.productType}*`,
          case_insensitive: true,
        },
      },
    });
  }
  if (params.carrierName) {
    must.push({
      prefix: {
        carrier_name: {
          value: params.carrierName,
          case_insensitive: true,
        },
      },
    });
  }

  const body: Record<string, unknown> = {
    size: limit,
    sort: [{ timestamp: "desc" }, { price: "desc" }],
    query: { bool: { must } },
  };

  log.debug("ES: query parcial", JSON.stringify(body.query, null, 2));

  try {
    log.info("[Elasticsearch] Executando busca parcial no index:", INDEX, "mode:", params.mode);
    const response = await client.search<FreteHit>({
      index: INDEX,
      body,
    });

    const hits = response.hits.hits ?? [];
    const results = hits.map((h) => h._source).filter((s): s is FreteHit => s != null);
    log.info("[Elasticsearch] Encontrados", results.length, "fretes (parcial)");
    return results;
  } catch (err) {
    log.error("[Elasticsearch] Erro na busca parcial:", err instanceof Error ? err.message : String(err));
    console.error("[Elasticsearch] Stack:", err instanceof Error ? err.stack : "(sem stack)");
    throw err;
  }
}
