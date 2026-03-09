/**
 * Cliente para notificar o n8n quando o caminhoneiro quer contratar um frete.
 */

import { agentEnv } from "../config.js";
import { log } from "../../../utils/logger.js";

export interface ContratarFretePayload {
  /** ID da mensagem do frete (para identificar no WhatsApp/grupo) */
  messageId?: string;
  /** RemoteJid do embarcador (para contato) */
  remoteJidEmbarcador?: string;
  rota: { origem?: string; destino?: string };
  frete: Record<string, unknown>;
  resumoConversa: string;
  dadosUsuario: { remoteJid: string };
}

const TIMEOUT_MS = 15_000;

export async function notifyContratarFrete(payload: ContratarFretePayload): Promise<void> {
  const url = agentEnv.n8n.webhookUrl();
  if (!url || url.trim() === "") {
    log.error("[n8n] N8N_WEBHOOK_CONTRATAR_FRETE não configurado");
    throw new Error("Webhook n8n não configurado. Defina N8N_WEBHOOK_CONTRATAR_FRETE.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    log.info("[n8n] Enviando payload para webhook contratar frete");
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text();
      log.error("[n8n] Erro HTTP", response.status, text.slice(0, 200));
      throw new Error(`n8n retornou ${response.status}: ${text.slice(0, 100)}`);
    }

    log.info("[n8n] Payload enviado com sucesso");
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error) {
      if (err.name === "AbortError") {
        log.error("[n8n] Timeout ao enviar para webhook");
        throw new Error("Timeout ao enviar solicitação. Tente novamente.");
      }
      throw err;
    }
    throw err;
  }
}
