/**
 * AsyncLocalStorage para propagar threadId às tools durante a execução do agente.
 * As tools do LangChain não recebem config diretamente, então usamos este contexto.
 */

import { AsyncLocalStorage } from "node:async_hooks";

interface ThreadContext {
  threadId: string;
}

const threadStorage = new AsyncLocalStorage<ThreadContext>();

/**
 * Executa a função fn dentro do contexto com threadId.
 * Usado em runAgent antes de invoke/stream.
 */
export function runWithThreadId<T>(threadId: string, fn: () => T | Promise<T>): Promise<T> {
  return Promise.resolve(threadStorage.run({ threadId }, fn));
}

/**
 * Obtém o threadId do contexto atual.
 * Retorna undefined se chamado fora de runWithThreadId.
 */
export function getThreadId(): string | undefined {
  return threadStorage.getStore()?.threadId;
}
