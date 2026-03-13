/**
 * Tool pesquisar_fretes_aberto — busca fretes sem filtro de rota.
 * Usada quando o usuário pede frete sem informar origem/destino (ex: "tem frete?", "o que tem?").
 * Usa internamente o cache da última pesquisa: se houver rota, faz busca silenciosa com ela.
 * Sem cache: retorna 8 fretes mais recentes (match_all).
 */

import { tool } from "@langchain/core/tools";
import z from "zod";
import { searchFretes } from "../services/elasticsearch.js";
import { searchFretesPartial } from "../services/elasticsearch.js";
import { getLastSearch, setLastSearch } from "../services/search-cache.js";
import { getThreadId } from "../context.js";
import { resolveLocation } from "./shared/resolve-location.js";
import { log } from "../../../utils/logger.js";

const LIMIT_ABERTO = 8;
const MIN_FRETES = 2;
const MAX_FRETES = 15;

function toFreteJson(f: {
  carrier_name?: string;
  origin?: { content?: string };
  destination?: { content?: string };
  price?: number;
  product_type?: string;
  vehicle_type?: string;
  weight_amount?: number;
  weight_unit?: string;
  timestamp?: string;
}) {
  return {
    carrier_name: f.carrier_name ?? null,
    origin: f.origin?.content ?? null,
    destination: f.destination?.content ?? null,
    price: f.price ?? null,
    product_type: f.product_type ?? null,
    vehicle_type: f.vehicle_type ?? null,
    weight_amount: f.weight_amount ?? null,
    weight_unit: f.weight_unit ?? null,
    timestamp: f.timestamp ?? null,
  };
}

export const pesquisarFretesAbertoTool = tool(
  async () => {
    const threadId = getThreadId();
    log.tool("pesquisar_fretes_aberto chamada");
    log.info("[pesquisar_fretes_aberto] Iniciando tool");

    try {
      const cached = threadId ? await getLastSearch(threadId) : null;
      const rota = cached?.rota ?? {};
      const origin = rota.origin?.trim();
      const destination = rota.destination?.trim();

      let fretes: Awaited<ReturnType<typeof searchFretes>>;
      let newRota: { origin?: string; destination?: string } = {};

      if (origin && destination) {
        log.info("[pesquisar_fretes_aberto] Cache com origem e destino, buscando rota completa:", origin, "->", destination);
        const query = `fretes de ${origin} para ${destination}`;

        const originResolved = await resolveLocation(origin, "origin", query, undefined);
        if (originResolved.clarificationQuestion) {
          log.info("[pesquisar_fretes_aberto] Clarificação na origem, fallback para busca aberta");
          fretes = await searchFretes({ limit: LIMIT_ABERTO });
        } else {
          const destResolved = await resolveLocation(destination, "destination", query, {
            name: origin,
            stateUf: originResolved.stateUf,
          });
          if (destResolved.clarificationQuestion) {
            log.info("[pesquisar_fretes_aberto] Clarificação no destino, fallback para busca aberta");
            fretes = await searchFretes({ limit: LIMIT_ABERTO });
          } else {
            fretes = await searchFretes({
              originLatLon: originResolved.latLon,
              originText: originResolved.text,
              destinationLatLon: destResolved.latLon,
              destinationText: destResolved.text,
              limit: MAX_FRETES,
            });
            newRota = { origin, destination };
          }
        }
      } else if (origin) {
        log.info("[pesquisar_fretes_aberto] Cache só com origem:", origin);
        const resolved = await resolveLocation(origin, "origin", `fretes de ${origin}`, undefined);
        if (resolved.clarificationQuestion) {
          log.info("[pesquisar_fretes_aberto] Clarificação na origem, fallback para busca aberta");
          fretes = await searchFretes({ limit: LIMIT_ABERTO });
        } else {
          fretes = await searchFretesPartial({
            mode: "origin",
            latLon: resolved.latLon,
            text: resolved.text,
            limit: MAX_FRETES,
          });
          newRota = { origin, destination: undefined };
        }
      } else if (destination) {
        log.info("[pesquisar_fretes_aberto] Cache só com destino:", destination);
        const resolved = await resolveLocation(destination, "destination", `fretes para ${destination}`, undefined);
        if (resolved.clarificationQuestion) {
          log.info("[pesquisar_fretes_aberto] Clarificação no destino, fallback para busca aberta");
          fretes = await searchFretes({ limit: LIMIT_ABERTO });
        } else {
          fretes = await searchFretesPartial({
            mode: "destination",
            latLon: resolved.latLon,
            text: resolved.text,
            limit: MAX_FRETES,
          });
          newRota = { origin: undefined, destination };
        }
      } else {
        log.info("[pesquisar_fretes_aberto] Sem cache, busca aberta (8 fretes mais recentes)");
        fretes = await searchFretes({ limit: LIMIT_ABERTO });
      }

      if (fretes.length === 0) {
        log.tool("Nenhum frete encontrado");
        return "Nenhum frete encontrado no momento. Tente informar uma rota (ex: fretes de Maringá para Paranaguá).";
      }

      const slice = fretes.slice(0, Math.min(MAX_FRETES, Math.max(MIN_FRETES, fretes.length)));
      log.tool(`Encontrados ${slice.length} fretes`);
      log.info("[pesquisar_fretes_aberto] Encontrados", slice.length, "fretes");

      if (threadId) {
        await setLastSearch(threadId, {
          fretes: slice,
          rota: newRota,
        });
      }

      const fretesJson = slice.map(toFreteJson);
      return JSON.stringify({ fretes: fretesJson });
    } catch (err) {
      log.error("[pesquisar_fretes_aberto] Erro:", err instanceof Error ? err.message : String(err));
      console.error("[pesquisar_fretes_aberto] Stack:", err instanceof Error ? err.stack : "(sem stack)");
      const msg = err instanceof Error ? err.message : String(err);
      return `Erro ao pesquisar fretes: ${msg}. Verifique Elasticsearch e API de localização.`;
    }
  },
  {
    name: "pesquisar_fretes_aberto",
    description: `Use quando o usuário pedir fretes SEM informar origem nem destino. Ex: "tem frete?", "o que tem?", "me mostra uns fretes", "quero ver fretes". NUNCA pergunte a rota. Retorna fretes mais recentes (até 8 se sem histórico, até 15 se usar rota do cache).`,
    schema: z.object({}),
  },
);
