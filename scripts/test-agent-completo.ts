/**
 * Testes intensivos do agente Rodezio — todas as funcionalidades.
 * Executar: pnpm test:agent:completo
 *
 * Opções:
 *   --verbose, -v     Exibe resposta completa em falhas
 *   --area=<tag>      Filtra cenários por tag (ex: --area=pesquisa, --area=conexao)
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runAgent } from "../src/agents/langgraph/index.js";

const THREAD = "test-completo-";
const VERBOSE = process.argv.includes("--verbose") || process.argv.includes("-v");
const AREA_ARG = process.argv.find((a) => a.startsWith("--area="));
const AREA_FILTER = AREA_ARG ? AREA_ARG.split("=")[1]?.toLowerCase() : undefined;

type Scenario = {
  name: string;
  messages: string[];
  tags?: string[];
  expect: {
    tool?: "pesquisar_fretes" | "pesquisar_fretes_flexivel" | "pesquisar_fretes_aberto" | "cotacao_frete" | "conectar_embarcador" | "nenhuma";
    contains?: string[];
    containsAny?: Array<string[]>;
    notContains?: string[];
    minMessages?: number;
    description: string;
  };
};

async function runScenario(
  scenario: Scenario,
  threadId: string,
): Promise<{ ok: boolean; response: string; fullResponse: string; details: string }> {
  let lastResponse = "";
  for (const msg of scenario.messages) {
    const { messages } = await runAgent(msg, { log: false, threadId });
    lastResponse = messages.join("\n---\n");
  }
  const full = lastResponse.toLowerCase();
  const msgs = lastResponse.split("\n---\n").filter(Boolean);

  let ok = true;
  const details: string[] = [];

  if (scenario.expect.contains) {
    for (const c of scenario.expect.contains) {
      if (!full.includes(c.toLowerCase())) {
        ok = false;
        details.push(`Faltou: "${c}"`);
      }
    }
  }
  if (scenario.expect.containsAny) {
    for (const group of scenario.expect.containsAny) {
      const found = group.some((term) => full.includes(term.toLowerCase()));
      if (!found) {
        ok = false;
        details.push(`Faltou um de: [${group.join(", ")}]`);
      }
    }
  }
  if (scenario.expect.notContains) {
    for (const n of scenario.expect.notContains) {
      if (full.includes(n.toLowerCase())) {
        ok = false;
        details.push(`Não deveria ter: "${n}"`);
      }
    }
  }
  if (scenario.expect.minMessages !== undefined && msgs.length < scenario.expect.minMessages) {
    ok = false;
    details.push(`Poucas mensagens: ${msgs.length} (esperado >= ${scenario.expect.minMessages})`);
  }

  return {
    ok,
    response: lastResponse.slice(0, 500) + (lastResponse.length > 500 ? "..." : ""),
    fullResponse: lastResponse,
    details: details.length ? details.join("; ") : "OK",
  };
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9_-]/gi, "-").replace(/-+/g, "-").slice(0, 60);
}

const scenarios: Scenario[] = [
  // --- PESQUISA ---
  {
    name: "Pesquisa origem+destino (pesquisar_fretes)",
    tags: ["pesquisa"],
    messages: ["fretes de São Paulo para Curitiba"],
    expect: {
      tool: "pesquisar_fretes",
      contains: ["rota", "valor"],
      minMessages: 2,
      description: "Lista fretes com rota e valor",
    },
  },
  {
    name: "Pesquisa só destino (pesquisar_fretes_flexivel)",
    tags: ["pesquisa"],
    messages: ["o que tem pra Santos?"],
    expect: {
      tool: "pesquisar_fretes_flexivel",
      containsAny: [
        ["destino", "pra santos", "indo pra", "santos"],
        ["rota"],
      ],
      minMessages: 2,
      description: "Lista fretes com contextualização destino",
    },
  },
  {
    name: "Pesquisa só origem",
    tags: ["pesquisa"],
    messages: ["fretes saindo de Maringá"],
    expect: {
      tool: "pesquisar_fretes_flexivel",
      contains: ["rota"],
      minMessages: 2,
      description: "Lista fretes com contextualização origem",
    },
  },
  {
    name: "Pesquisa com sigla (MT pra Baixada)",
    tags: ["pesquisa"],
    messages: ["tem frete de MT pra Baixada?"],
    expect: {
      contains: ["rota"],
      minMessages: 2,
      description: "Expande MT/Baixada e lista fretes",
    },
  },
  {
    name: "Pesquisa sem rota (pesquisar_fretes_aberto)",
    tags: ["pesquisa"],
    messages: ["tem frete?"],
    expect: {
      tool: "pesquisar_fretes_aberto",
      containsAny: [
        ["achei", "olha", "dá uma olhada", "vê se algum"],
        ["rota", "Rota:"],
      ],
      minMessages: 2,
      description: "Usa pesquisar_fretes_aberto e mostra fretes com intro genérica",
    },
  },
  {
    name: "Pesquisa sem rota com cache (reutiliza última rota)",
    tags: ["pesquisa", "contexto"],
    messages: ["fretes de Maringá para Paranaguá", "tem frete?"],
    expect: {
      containsAny: [
        ["achei", "olha", "dá uma olhada", "vê se algum"],
        ["rota", "Rota:"],
      ],
      minMessages: 2,
      notContains: ["busquei de maringá", "busquei de paranaguá", "que você tava vendo"],
      description: "Usa cache silenciosamente, intro genérica sem revelar rota",
    },
  },
  // --- COTAÇÃO ---
  {
    name: "Cotação - direciona para Jonatas",
    tags: ["cotacao"],
    messages: ["quero cotar frete de Campinas pra Curitiba"],
    expect: {
      tool: "cotacao_frete",
      contains: ["99733", "jonatas"],
      description: "Direciona para (16) 99733-0113",
    },
  },
  {
    name: "Cotação - orçamento",
    tags: ["cotacao"],
    messages: ["preciso de orçamento de frete"],
    expect: {
      contains: ["99733", "jonatas"],
      description: "Reconhece orçamento como cotação",
    },
  },
  // --- CONEXÃO COM EMBARCADOR ---
  {
    name: "Quero ver detalhes (INFO, não conecta)",
    tags: ["conexao"],
    messages: ["fretes para Santos", "me fala mais sobre o primeiro"],
    expect: {
      notContains: ["posso te colocar", "confirma", "conectar_embarcador"],
      contains: ["rota", "valor"],
      description: "Mostra dados, NÃO pede conexão",
    },
  },
  {
    name: "Quero esse - pergunta em aberto",
    tags: ["conexao"],
    messages: ["fretes para Santos", "quero o primeiro"],
    expect: {
      contains: ["posso te colocar", "contato", "embarcador"],
      notContains: ["confirma?", "fechar"],
      description: "Pergunta Posso te colocar em contato, sem Confirma",
    },
  },
  {
    name: "Sim, pode conectar (confirmação)",
    tags: ["conexao"],
    messages: ["fretes para Santos", "quero o segundo", "sim, pode ser"],
    expect: {
      tool: "conectar_embarcador",
      contains: ["embarcador", "contato"],
      description: "Chama tool após confirmação",
    },
  },
  {
    name: "Me passa contato - imediato",
    tags: ["conexao"],
    messages: ["fretes de Rio Verde para Santos", "me passa o WhatsApp do embarcador do primeiro"],
    expect: {
      tool: "conectar_embarcador",
      contains: ["embarcador", "contato"],
      notContains: ["confirma", "não consigo passar"],
      description: "Chama tool imediatamente, sem confirma",
    },
  },
  {
    name: "Pedágio incluso - não inventa",
    tags: ["conexao"],
    messages: ["fretes de São Paulo para Curitiba", "o pedágio tá incluso no valor?"],
    expect: {
      contains: ["infelizmente", "não tenho", "contato", "embarcador"],
      notContains: ["sim, está", "sim está"],
      description: "Não inventa, oferece conexão",
    },
  },
  // --- FORA DO ESCOPO ---
  {
    name: "Assunto fora - redireciona",
    tags: ["escopo"],
    messages: ["qual a previsão do tempo amanhã?"],
    expect: {
      tool: "nenhuma",
      contains: ["frete", "estrada"],
      description: "Redireciona para o que fazemos",
    },
  },
  // --- CUMPRIMENTOS ---
  {
    name: "Cumprimento - sem ferramenta",
    tags: ["escopo"],
    messages: ["Oi, tudo bem?"],
    expect: {
      tool: "nenhuma",
      notContains: ["pesquisar_fretes", "cotacao"],
      description: "Responde direto, sem tool",
    },
  },
  // --- PEDIDO CONTATO SEM CONTEXTO ---
  {
    name: "Contato sem frete - pede indicar/pesquisar",
    tags: ["conexao"],
    messages: ["me passa o contato do embarcador"],
    expect: {
      containsAny: [
        ["pesquisar", "rota", "destino", "frete"],
        ["frete", "embarcador"],
      ],
      notContains: ["99733", "jonatas"],
      description: "Pede qual frete ou para pesquisar; não passa contato",
    },
  },
  // --- REFERÊNCIA "ESSE", "O SEGUNDO" ---
  {
    name: "Referência 'o de X para Y'",
    tags: ["conexao", "contexto"],
    messages: ["fretes de São Paulo para Curitiba", "quero o de Paranaguá pra São Francisco"],
    expect: {
      contains: ["rota", "paranaguá", "são francisco"],
      description: "Interpreta referência no contexto",
    },
  },
  // --- NOVOS CENÁRIOS ---
  {
    name: "Lista vazia - mensagem quando não há fretes",
    tags: ["pesquisa"],
    messages: ["fretes de Xyz123 para Abc456"],
    expect: {
      containsAny: [["não achei", "não encontrei", "não tem", "nenhum", "não achei nenhum"]],
      minMessages: 1,
      description: "Mensagem quando não há fretes",
    },
  },
  {
    name: "Cotação sem rota - direciona sem pedir dados",
    tags: ["cotacao"],
    messages: ["quero uma cotação"],
    expect: {
      contains: ["99733", "jonatas"],
      notContains: ["qual origem", "qual destino"],
      description: "Direciona para Jonatas sem pedir origem/destino",
    },
  },
  {
    name: "Negativa na conexão - não chama tool",
    tags: ["conexao"],
    messages: ["fretes para Santos", "quero o primeiro", "não, deixa"],
    expect: {
      notContains: ["vou falar", "logo ele entra"],
      description: "Não chama conectar_embarcador quando usuário desiste",
    },
  },
  {
    name: "Múltiplas referências - quero o terceiro",
    tags: ["conexao", "contexto"],
    messages: ["fretes de São Paulo para Curitiba", "quero o terceiro"],
    expect: {
      containsAny: [
        ["rota", "posso te colocar"],
        ["embarcador", "contato"],
      ],
      description: "Interpreta índice correto na lista",
    },
  },
  {
    name: "Pergunta fora após contexto - redireciona",
    tags: ["escopo"],
    messages: ["fretes para Santos", "qual a capital do Brasil?"],
    expect: {
      contains: ["frete", "estrada"],
      description: "Redireciona para o que fazemos mesmo com histórico",
    },
  },
  {
    name: "Dúvida sobre estrada - sem tool",
    tags: ["escopo"],
    messages: ["qual a lei do pedágio para caminhão?"],
    expect: {
      containsAny: [["pedágio", "frete", "estrada"]],
      notContains: ["pesquisar_fretes", "cotacao_frete", "conectar_embarcador"],
      description: "Responde sobre estrada sem chamar tools",
    },
  },
];

async function main(): Promise<void> {
  const filtered =
    AREA_FILTER ?
      scenarios.filter((s) => s.tags?.some((t) => t.toLowerCase() === AREA_FILTER))
    : scenarios;

  if (AREA_FILTER && filtered.length === 0) {
    console.error(`Nenhum cenário com tag "${AREA_FILTER}". Tags disponíveis: pesquisa, cotacao, conexao, escopo, contexto`);
    process.exit(1);
  }

  console.log("\n" + "=".repeat(70));
  console.log("TESTES INTENSIVOS DO AGENTE RODEZIO");
  if (AREA_FILTER) console.log(`Filtro: --area=${AREA_FILTER} (${filtered.length} cenários)`);
  console.log("=".repeat(70));

  const results: { name: string; ok: boolean; response: string; fullResponse: string; details: string; scenario: Scenario }[] = [];

  for (let i = 0; i < filtered.length; i++) {
    const s = filtered[i];
    const tid = `${THREAD}${i}-${Date.now()}`;
    process.stdout.write(`\n[${i + 1}/${filtered.length}] ${s.name}... `);
    try {
      const r = await runScenario(s, tid);
      results.push({ name: s.name, ...r, scenario: s });
      console.log(r.ok ? "OK" : "FALHOU");
      if (!r.ok) {
        console.log(`    Esperado: ${s.expect.description}\n    ${r.details}`);
        if (VERBOSE) console.log(`\n--- Resposta completa ---\n${r.fullResponse}\n---`);
      }
    } catch (e) {
      results.push({
        name: s.name,
        ok: false,
        response: "",
        fullResponse: "",
        details: String(e),
        scenario: s,
      });
      console.log("ERRO");
      console.log(`    ${e}`);
    }
  }

  // Resumo
  console.log("\n" + "=".repeat(70));
  console.log("RESUMO - COMO A IA REAGIU");
  console.log("=".repeat(70));

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  results.forEach((r) => {
    console.log(`${r.ok ? "✅" : "❌"} ${r.name}`);
  });

  console.log(`\n${passed}/${results.length} cenários passaram.`);

  if (failed.length > 0) {
    console.log("\n--- FALHAS (detalhes) ---");
    try {
      mkdirSync("test-results", { recursive: true });
    } catch {
      // ignore
    }
    failed.forEach((f, idx) => {
      console.log(`\n❌ ${f.name}`);
      console.log(`   ${f.details}`);
      if (f.response) {
        const preview = VERBOSE ? f.fullResponse : f.response.slice(0, 200) + "...";
        console.log(`   Resposta: ${preview}`);
      }
      const content = `Cenário: ${f.name}
Esperado: ${f.scenario.expect.description}
Detalhes: ${f.details}

Mensagens do usuário:
${f.scenario.messages.map((m) => `  - "${m}"`).join("\n")}

Resposta real:
${f.fullResponse || f.response || "(vazia)"}
`;
      const filename = `falha-${idx + 1}-${sanitizeFilename(f.name)}.txt`;
      writeFileSync(join("test-results", filename), content, "utf-8");
    });
    console.log(`\nRespostas salvos em test-results/`);
  }

  // Resumo por funcionalidade
  console.log("\n" + "=".repeat(70));
  console.log("RESUMO POR FUNCIONALIDADE");
  console.log("=".repeat(70));

  const byArea: Record<string, { ok: number; total: number }> = {};
  const tagToArea: Record<string, string> = {
    pesquisa: "Pesquisa",
    cotacao: "Cotação",
    conexao: "Conexão/Embarcador",
    escopo: "Fora do escopo",
    contexto: "Contexto/Referência",
  };
  for (const r of results) {
    const primaryTag = r.scenario.tags?.[0] ?? "outros";
    const area = tagToArea[primaryTag] ?? "Outros";
    if (!byArea[area]) byArea[area] = { ok: 0, total: 0 };
    byArea[area].total++;
    if (r.ok) byArea[area].ok++;
  }
  for (const [area, stats] of Object.entries(byArea)) {
    console.log(`${area}: ${stats.ok}/${stats.total}`);
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
