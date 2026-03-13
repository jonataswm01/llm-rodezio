/**
 * Script para testar as alterações do doc CONEXAO_EMBARCADOR.
 * Cenários críticos do plano de validação.
 *
 * Executar: pnpm tsx --env-file=.env scripts/test-agent-conexao.ts
 */

import { runAgent } from "../src/agents/langgraph/index.js";

const THREAD_PREFIX = "test-conexao-";

async function runScenario(
  name: string,
  messages: string[],
  threadId: string,
): Promise<string[]> {
  console.log("\n" + "=".repeat(60));
  console.log(`CENÁRIO: ${name}`);
  console.log("=".repeat(60));

  let lastMessages: string[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    console.log(`\n>>> Usuário (${i + 1}/${messages.length}): "${msg}"`);
    const { messages: out } = await runAgent(msg, {
      log: false,
      threadId,
    });
    lastMessages = out;
    console.log(`\n<<< Resposta (${out.length} mensagem(ns)):`);
    out.forEach((m, j) => console.log(`  [${j + 1}] ${m.slice(0, 200)}${m.length > 200 ? "..." : ""}`));
  }
  return lastMessages;
}

function assertContains(text: string, substring: string, negate = false): boolean {
  const found = text.toLowerCase().includes(substring.toLowerCase());
  return negate ? !found : found;
}

async function main(): Promise<void> {
  console.log("Iniciando testes do agente (CONEXAO_EMBARCADOR)...\n");

  const results: { name: string; ok: boolean; details: string }[] = [];

  // Cenário 1: "O pedágio está incluso no valor?" — deve responder "Infelizmente não tenho essa informação" e oferecer conexão
  try {
    const msgs = await runScenario(
      "1. IA não inventa - pedágio incluso",
      ["fretes de São Paulo para Curitiba", "O pedágio está incluso no valor desse frete?"],
      `${THREAD_PREFIX}1`,
    );
    const full = msgs.join(" ");
    const ok =
      assertContains(full, "infelizmente") ||
      assertContains(full, "não tenho") ||
      assertContains(full, "não sei") ||
      assertContains(full, "não tenho essa informação");
    const offersConnection = assertContains(full, "contato") || assertContains(full, "conectar") || assertContains(full, "embarcador");
    const noInvented =
      !full.toLowerCase().includes("sim, está incluso") && !full.toLowerCase().includes("sim está incluso");
    results.push({
      name: "Pedágio incluso - não inventa + oferece conexão",
      ok: ok && (offersConnection || !full.includes("pedágio")),
      details: ok ? "Resposta adequada" : `Resposta: ${full.slice(0, 150)}...`,
    });
  } catch (e) {
    results.push({ name: "Pedágio incluso", ok: false, details: String(e) });
  }

  // Cenário 2: "Quero fechar" — IA reconhece intenção mas NUNCA responde com "fechar"
  try {
    const msgs = await runScenario(
      "2. Quero fechar - reconhece mas não responde com fechar",
      ["fretes para Santos", "quero fechar o primeiro"],
      `${THREAD_PREFIX}2`,
    );
    const full = msgs.join(" ").toLowerCase();
    const noFecharNaResposta = !full.includes("fechar") || full.includes("quero fechar"); // pode citar o que usuário disse
    const perguntaConectar =
      full.includes("posso te colocar") ||
      full.includes("posso te conectar") ||
      full.includes("colocar em contato") ||
      full.includes("fazer a ponte");
    results.push({
      name: "Quero fechar - não usa fechar na resposta",
      ok: noFecharNaResposta && (perguntaConectar || full.includes("dados") || full.includes("rota")),
      details: noFecharNaResposta ? "OK" : `Resposta contém 'fechar': ${full.slice(0, 200)}`,
    });
  } catch (e) {
    results.push({ name: "Quero fechar", ok: false, details: String(e) });
  }

  // Cenário 3: "Me passa o contato" após ver fretes — deve chamar tool imediatamente (mensagem da tool)
  try {
    const msgs = await runScenario(
      "3. Me passa contato - chama tool imediatamente",
      ["fretes de São Paulo para Curitiba", "me passa o contato do embarcador do primeiro"],
      `${THREAD_PREFIX}3`,
    );
    const full = msgs.join(" ");
    const toolMessage =
      assertContains(full, "vou falar com o embarcador") ||
      assertContains(full, "logo ele entra em contato") ||
      assertContains(full, "acionar") ||
      assertContains(full, "responsável");
    const noConfirma = !assertContains(full, "confirma");
    const noNaoConsigo = !assertContains(full, "não consigo passar");
    results.push({
      name: "Me passa contato - tool imediata, sem confirma",
      ok: (toolMessage || full.includes("Pesquise fretes")) && noConfirma && noNaoConsigo,
      details: toolMessage ? "Chamou tool" : `Resposta: ${full.slice(0, 150)}`,
    });
  } catch (e) {
    results.push({ name: "Me passa contato", ok: false, details: String(e) });
  }

  // Cenário 4: "Quero esse" — deve mostrar dados + perguntar "Posso te colocar em contato?"
  try {
    const msgs = await runScenario(
      "4. Quero esse - dados + pergunta em aberto",
      ["fretes para Santos", "quero o primeiro"],
      `${THREAD_PREFIX}4`,
    );
    const full = msgs.join(" ");
    const perguntaAberta =
      assertContains(full, "posso te colocar") ||
      assertContains(full, "posso te conectar") ||
      assertContains(full, "colocar em contato") ||
      assertContains(full, "fazer a ponte") ||
      assertContains(full, "quer que eu");
    const noConfirma = !assertContains(full, "confirma?") && !assertContains(full, "confirma pra");
    const noFechar = !assertContains(full, "fechar");
    results.push({
      name: "Quero esse - pergunta aberta, sem confirma/fechar",
      ok: perguntaAberta && noConfirma && noFechar,
      details: perguntaAberta ? "Pergunta em aberto OK" : `Resposta: ${full.slice(0, 150)}`,
    });
  } catch (e) {
    results.push({ name: "Quero esse", ok: false, details: String(e) });
  }

  // Resumo
  console.log("\n" + "=".repeat(60));
  console.log("RESUMO DOS TESTES");
  console.log("=".repeat(60));
  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  results.forEach((r) => {
    console.log(`${r.ok ? "✅" : "❌"} ${r.name}`);
    if (!r.ok) console.log(`   ${r.details}`);
  });
  console.log(`\n${passed}/${total} cenários passaram.`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
