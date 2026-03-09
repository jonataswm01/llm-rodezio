/**
 * Custom Redis-based checkpoint saver for LangGraph.
 *
 * Usa ioredis com Redis padrão (sem precisar de módulos RedisJSON/RediSearch).
 * Serializa checkpoints como Buffer (via serde do LangGraph) e armazena
 * usando HSET/HGET/HDEL padrão.
 *
 * Chaves Redis:
 *   cp:{thread_id}:{ns}:{checkpoint_id}   → Hash { "checkpoint": Buffer, "metadata": Buffer, "parent_id": string }
 *   cp_idx:{thread_id}:{ns}               → Sorted Set (score = timestamp, member = checkpoint_id)
 *   wr:{thread_id}:{ns}:{checkpoint_id}   → Hash { "taskId,idx": Buffer }
 */

import Redis from "ioredis";
import {
  BaseCheckpointSaver,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointTuple,
  type ChannelVersions,
  copyCheckpoint,
  WRITES_IDX_MAP,
  getCheckpointId,
} from "@langchain/langgraph-checkpoint";
import type { CheckpointMetadata, PendingWrite } from "@langchain/langgraph-checkpoint";
import type { RunnableConfig } from "@langchain/core/runnables";
import { agentEnv } from "../config.js";
import { log } from "../../../utils/logger.js";

// Converte Uint8Array para Buffer (para armazenar no Redis) e vice-versa
function toBuffer(data: Uint8Array): Buffer {
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}

function toUint8Array(buf: Buffer): Uint8Array {
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

function cpKey(threadId: string, ns: string, checkpointId: string): string {
  return `cp:${threadId}:${ns}:${checkpointId}`;
}

function cpIndexKey(threadId: string, ns: string): string {
  return `cp_idx:${threadId}:${ns}`;
}

function wrKey(threadId: string, ns: string, checkpointId: string): string {
  return `wr:${threadId}:${ns}:${checkpointId}`;
}

export class RedisSaver extends BaseCheckpointSaver {
  private redis: Redis;

  constructor() {
    super();
    const url = agentEnv.redis.url();
    this.redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 200, 3000);
        return delay;
      },
      lazyConnect: true,
    });
    this.redis.on("error", (err) => {
      log.error("[RedisSaver] Erro de conexão Redis:", err.message);
    });
    this.redis.on("connect", () => {
      log.info("[RedisSaver] Conectado ao Redis");
    });
    // Conectar imediatamente
    this.redis.connect().catch((err) => {
      log.error("[RedisSaver] Falha ao conectar ao Redis:", err.message);
    });
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id as string;
    const checkpointNs = (config.configurable?.checkpoint_ns as string) ?? "";
    let checkpointId = getCheckpointId(config);

    if (!threadId) return undefined;

    // Se não tem checkpoint_id, busca o mais recente
    if (!checkpointId) {
      const latest = await this.redis.zrevrange(cpIndexKey(threadId, checkpointNs), 0, 0);
      if (!latest || latest.length === 0) return undefined;
      checkpointId = latest[0];
    }

    const key = cpKey(threadId, checkpointNs, checkpointId);
    const data = await this.redis.hgetallBuffer(key);
    if (!data || !data.checkpoint) return undefined;

    const checkpoint = (await this.serde.loadsTyped("json", toUint8Array(data.checkpoint))) as Checkpoint;
    const metadata = (await this.serde.loadsTyped("json", toUint8Array(data.metadata))) as CheckpointMetadata;
    const parentId = data.parent_id ? data.parent_id.toString("utf-8") : undefined;

    // Busca pending writes
    const writesKey = wrKey(threadId, checkpointNs, checkpointId);
    const rawWrites = await this.redis.hgetallBuffer(writesKey);
    const pendingWrites: [string, string, unknown][] = [];
    if (rawWrites) {
      for (const [innerKey, value] of Object.entries(rawWrites)) {
        const parsed = JSON.parse(innerKey) as [string, string];
        const [taskId, channel] = parsed;
        const deserialized = await this.serde.loadsTyped("json", toUint8Array(value as unknown as Buffer));
        pendingWrites.push([taskId, channel, deserialized]);
      }
    }

    const tuple: CheckpointTuple = {
      config: {
        configurable: {
          thread_id: threadId,
          checkpoint_ns: checkpointNs,
          checkpoint_id: checkpointId,
        },
      },
      checkpoint,
      metadata,
      pendingWrites,
    };

    if (parentId) {
      tuple.parentConfig = {
        configurable: {
          thread_id: threadId,
          checkpoint_ns: checkpointNs,
          checkpoint_id: parentId,
        },
      };
    }

    return tuple;
  }

  async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions,
  ): AsyncGenerator<CheckpointTuple> {
    const threadId = config.configurable?.thread_id as string;
    const checkpointNs = (config.configurable?.checkpoint_ns as string) ?? "";
    if (!threadId) return;

    const { limit, before, filter } = options ?? {};
    const beforeId = before?.configurable?.checkpoint_id as string | undefined;

    // Pega todos os checkpoint IDs ordenados por timestamp desc
    let ids: string[];
    if (beforeId) {
      const score = await this.redis.zscore(cpIndexKey(threadId, checkpointNs), beforeId);
      if (score) {
        ids = await this.redis.zrevrangebyscore(
          cpIndexKey(threadId, checkpointNs),
          `(${score}`,
          "-inf",
          "LIMIT",
          0,
          limit ?? 100,
        );
      } else {
        ids = await this.redis.zrevrange(
          cpIndexKey(threadId, checkpointNs),
          0,
          (limit ?? 100) - 1,
        );
      }
    } else {
      ids = await this.redis.zrevrange(
        cpIndexKey(threadId, checkpointNs),
        0,
        (limit ?? 100) - 1,
      );
    }

    let count = 0;
    for (const cpId of ids) {
      if (limit !== undefined && count >= limit) break;

      const key = cpKey(threadId, checkpointNs, cpId);
      const data = await this.redis.hgetallBuffer(key);
      if (!data || !data.checkpoint) continue;

      const metadata = (await this.serde.loadsTyped("json", toUint8Array(data.metadata))) as CheckpointMetadata;

      // Aplica filtro de metadata
      if (filter) {
        const matches = Object.entries(filter).every(
          ([k, v]) => (metadata as Record<string, unknown>)[k] === v,
        );
        if (!matches) continue;
      }

      const checkpoint = (await this.serde.loadsTyped("json", toUint8Array(data.checkpoint))) as Checkpoint;
      const parentId = data.parent_id ? data.parent_id.toString("utf-8") : undefined;

      const writesKey = wrKey(threadId, checkpointNs, cpId);
      const rawWrites = await this.redis.hgetallBuffer(writesKey);
      const pendingWrites: [string, string, unknown][] = [];
      if (rawWrites) {
        for (const [innerKey, value] of Object.entries(rawWrites)) {
          const parsed = JSON.parse(innerKey) as [string, string];
          const [taskId, channel] = parsed;
          const deserialized = await this.serde.loadsTyped("json", toUint8Array(value as unknown as Buffer));
          pendingWrites.push([taskId, channel, deserialized]);
        }
      }

      const tuple: CheckpointTuple = {
        config: {
          configurable: {
            thread_id: threadId,
            checkpoint_ns: checkpointNs,
            checkpoint_id: cpId,
          },
        },
        checkpoint,
        metadata,
        pendingWrites,
      };

      if (parentId) {
        tuple.parentConfig = {
          configurable: {
            thread_id: threadId,
            checkpoint_ns: checkpointNs,
            checkpoint_id: parentId,
          },
        };
      }

      yield tuple;
      count++;
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    _newVersions: ChannelVersions,
  ): Promise<RunnableConfig> {
    const threadId = config.configurable?.thread_id as string;
    const checkpointNs = (config.configurable?.checkpoint_ns as string) ?? "";
    if (!threadId) {
      throw new Error(
        'Failed to put checkpoint. Missing "thread_id" in configurable.',
      );
    }

    const preparedCheckpoint = copyCheckpoint(checkpoint);
    const [[, serializedCheckpoint], [, serializedMetadata]] = await Promise.all([
      this.serde.dumpsTyped(preparedCheckpoint),
      this.serde.dumpsTyped(metadata),
    ]);

    const key = cpKey(threadId, checkpointNs, checkpoint.id);
    const parentCheckpointId = config.configurable?.checkpoint_id as string | undefined;

    const pipeline = this.redis.pipeline();

    // Salva checkpoint como hash
    pipeline.hset(key, {
      checkpoint: toBuffer(serializedCheckpoint),
      metadata: toBuffer(serializedMetadata),
      ...(parentCheckpointId ? { parent_id: parentCheckpointId } : {}),
    });

    // Adiciona ao índice temporal (score = timestamp numérico do UUID6-sortable ID)
    const timestamp = Date.now();
    pipeline.zadd(cpIndexKey(threadId, checkpointNs), timestamp.toString(), checkpoint.id);

    await pipeline.exec();

    log.debug(`[RedisSaver] Checkpoint salvo: thread=${threadId} id=${checkpoint.id}`);

    return {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: checkpointNs,
        checkpoint_id: checkpoint.id,
      },
    };
  }

  async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string,
  ): Promise<void> {
    const threadId = config.configurable?.thread_id as string;
    const checkpointNs = (config.configurable?.checkpoint_ns as string) ?? "";
    const checkpointId = config.configurable?.checkpoint_id as string;

    if (!threadId) {
      throw new Error(
        'Failed to put writes. Missing "thread_id" in configurable.',
      );
    }
    if (!checkpointId) {
      throw new Error(
        'Failed to put writes. Missing "checkpoint_id" in configurable.',
      );
    }

    const key = wrKey(threadId, checkpointNs, checkpointId);

    const pipeline = this.redis.pipeline();
    for (let idx = 0; idx < writes.length; idx++) {
      const [channel, value] = writes[idx];
      const [, serializedValue] = await this.serde.dumpsTyped(value);
      const writeIdx = WRITES_IDX_MAP[channel as string] ?? idx;
      const innerKey = JSON.stringify([taskId, channel]);

      // Não sobrescreve writes com idx >= 0 que já existem
      if (writeIdx >= 0) {
        const exists = await this.redis.hexists(key, innerKey);
        if (exists) continue;
      }

      pipeline.hset(key, innerKey, toBuffer(serializedValue));
    }
    await pipeline.exec();
  }

  async deleteThread(threadId: string): Promise<void> {
    // Busca todos os namespaces desse thread
    const pattern = `cp:${threadId}:*`;
    const wrPattern = `wr:${threadId}:*`;
    const idxPattern = `cp_idx:${threadId}:*`;

    const keysToDelete: string[] = [];

    for await (const key of this.redis.scanStream({ match: pattern, count: 100 })) {
      if (Array.isArray(key)) {
        keysToDelete.push(...key);
      } else {
        keysToDelete.push(key as string);
      }
    }
    for await (const key of this.redis.scanStream({ match: wrPattern, count: 100 })) {
      if (Array.isArray(key)) {
        keysToDelete.push(...key);
      } else {
        keysToDelete.push(key as string);
      }
    }
    for await (const key of this.redis.scanStream({ match: idxPattern, count: 100 })) {
      if (Array.isArray(key)) {
        keysToDelete.push(...key);
      } else {
        keysToDelete.push(key as string);
      }
    }

    if (keysToDelete.length > 0) {
      await this.redis.del(...keysToDelete);
      log.info(`[RedisSaver] Thread ${threadId} deletada (${keysToDelete.length} chaves)`);
    }
  }
}
