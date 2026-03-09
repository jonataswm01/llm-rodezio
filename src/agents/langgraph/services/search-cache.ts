/**
 * Cache Redis para a última pesquisa de fretes por thread.
 * Usado pela tool contratar_frete para obter rota e frete real (com ID).
 */

import Redis from "ioredis";
import { agentEnv } from "../config.js";
import type { FreteHit } from "./elasticsearch.js";
import { log } from "../../../utils/logger.js";

const TTL_SECONDS = 3600; // 1 hora
const KEY_PREFIX = "rodezio:thread:";

function cacheKey(threadId: string): string {
  return `${KEY_PREFIX}${threadId}:last_search`;
}

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    const url = agentEnv.redis.url();
    redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 200, 3000);
        return delay;
      },
      lazyConnect: true,
    });
    redis.on("error", (err) => {
      log.error("[SearchCache] Erro Redis:", err.message);
    });
    redis.connect().catch((err) => {
      log.error("[SearchCache] Falha ao conectar:", err.message);
    });
  }
  return redis;
}

export interface LastSearchData {
  fretes: FreteHit[];
  rota: { origin?: string; destination?: string };
}

export async function setLastSearch(
  threadId: string,
  data: LastSearchData,
): Promise<void> {
  if (!threadId) return;
  try {
    const key = cacheKey(threadId);
    const value = JSON.stringify(data);
    await getRedis().setex(key, TTL_SECONDS, value);
    log.debug("[SearchCache] Cache gravado para thread:", threadId, "fretes:", data.fretes.length);
  } catch (err) {
    log.error("[SearchCache] Erro ao gravar cache:", err instanceof Error ? err.message : String(err));
  }
}

export async function getLastSearch(threadId: string): Promise<LastSearchData | null> {
  if (!threadId) return null;
  try {
    const key = cacheKey(threadId);
    const value = await getRedis().get(key);
    if (!value) return null;
    const parsed = JSON.parse(value) as LastSearchData;
    if (!parsed.fretes || !Array.isArray(parsed.fretes)) return null;
    return parsed;
  } catch (err) {
    log.error("[SearchCache] Erro ao ler cache:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
