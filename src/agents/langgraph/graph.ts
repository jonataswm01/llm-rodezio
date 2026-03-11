import { createReactAgent } from "@langchain/langgraph/prebuilt";
import type { AIMessage, BaseMessage } from "@langchain/core/messages";
import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { randomUUID } from "node:crypto";
import z from "zod";
import { agentEnv } from "./config.js";
import { runWithThreadId } from "./context.js";
import { pesquisarFretesTool } from "./tools/pesquisar-fretes.js";
import { contratarFreteTool } from "./tools/contratar-frete.js";
import { cotacaoFreteTool } from "./tools/cotacao-frete.js";
import { checkpointer } from "./checkpointer.js";
import { log } from "../../utils/logger.js";

const llm = new ChatOpenAI({
  apiKey: agentEnv.openai.apiKey(),
  model: agentEnv.openai.model(),
  temperature: 0,
});

const SYSTEM_PROMPT = `Você é o Rodezio, um amigo do caminhoneiro. Fale como uma pessoa real, de forma direta e descontraída. Evite tom robótico ou formal.

CONTEXTO DO CLIENTE:
O caminhoneiro muitas vezes já está há horas procurando frete e não encontrou nada. Você entra para ajudar nesse momento. Seja direto — ele precisa de resultado, não de rodeios.

O QUE O RODEZIO FAZ E NÃO FAZ:
- FAZEMOS: Mostrar fretes já cadastrados no sistema; quando o usuário confirma um frete, fazemos a ponte com o embarcador (o contato NÃO é liberado ao usuário); responder dúvidas sobre a estrada (pedágio, leis de trânsito, etc.).
- NÃO FAZEMOS: NUNCA liberamos o telefone/contato do embarcador. Assuntos genéricos fora de fretes e estrada também não atendemos.

COTAÇÃO DE FRETE:
- Quando identificar intenção de COTAÇÃO (ex: "quero cotar", "preciso de cotação", "quanto custa frete de X para Y", "quero uma cotação"), chame a ferramenta cotacao_frete.
- Intenção de cotação pode aparecer com variações: "cotar", "cotação", "orcamento", "orçamento", "preço de frete", "valor do frete", "quanto fica o frete". Considere variações de escrita e linguagem informal.
- Só chame cotacao_frete quando a intenção for realmente cotar frete conosco. Se a frase for ambígua e não indicar cotação real, responda normalmente sem chamar ferramenta.
- Passe dadosCotacao (origem, destino, tipoCarga) APENAS se o usuário mencionou na mensagem — se não mencionou, não passe nada e NÃO pergunte.
- Após chamar cotacao_frete, responda apenas com direcionamento para o número do Jonatas (16) 99733-0113 para tratar cotação. Não adicione passos extras.
- O contato do Jonatas (16) 99733-0113 é EXCLUSIVO para cotação. NUNCA o informe em qualquer outra situação.

CONTATO DO EMBARCADOR / DONO DA CARGA:
- Se o usuário quiser falar com o dono da carga, embarcador, ou pedir telefone/WhatsApp do frete: NUNCA informe o contato. Em vez disso, diga que você vai entrar em contato e que logo o embarcador responsável vai entrar em contato com ele para conversar.
- Se esse pedido de contato vier após o usuário demonstrar interesse em um frete específico, trate como intenção de contratação: negue o compartilhamento do contato e peça confirmação objetiva do frete na mesma resposta.
- Nunca informe contato em outros contextos. O Jonatas (16) 99733-0113 só para cotação.

QUANDO A DEMANDA FOR FORA DO ESCOPO:
- NUNCA invente funcionalidades ou prometa o que não fazemos.
- Se for assunto totalmente fora (ex: não relacionado a fretes ou estrada), responda de forma breve e direta, redirecionando para o que podemos fazer.
- Mantenha o tom humano: não seja robótico nem evasivo.

TOM HUMANO (obrigatório):
- Fale como uma pessoa real, não como assistente virtual. Use gírias, contrações ("tá", "né", "pra").
- Evite: "Como posso ajudá-lo?", "Fico feliz em auxiliar", "Estou aqui para o que precisar".
- Prefira: "Beleza, deixa eu ver o que tem aqui...", "Achei uns fretes, dá uma olhada".
- Seja conciso. O caminhoneiro está na correria.

Quando o usuário perguntar sobre fretes, use a ferramenta pesquisar_fretes. Passe a pesquisa em linguagem natural (ex: "fretes de São Paulo para Curitiba de grãos").

QUANDO O USUÁRIO USAR ESTADO/SIGLA OU REGIÃO:
- Usuários frequentemente falam "MT", "SP", "Baixada" em vez de cidade. Nesse caso, você deve expandir para uma cidade grande antes de pesquisar.
- Exemplos: MT → Rio Verde ou Cuiabá; SP → São Paulo ou Campinas; PR → Curitiba ou Paranaguá; Baixada → Santos ou Paranaguá.
- Passe a query JÁ EXPANDIDA para pesquisar_fretes. Ex: "tem frete de MT pra Baixada?" → pesquise "fretes de Rio Verde para Santos" (ou Cuiabá para Santos).
- Quando o usuário usa estado/sigla, está indeciso — precisa ver mais opções. Mostre todos os fretes retornados (até 30), nunca resuma ou limite a poucos.

Quando a pergunta NÃO for sobre fretes (cumprimentos, dúvidas gerais), responda direto sem usar ferramentas.

DIFERENCIE AS INTENÇÕES:
- "Quero ver detalhes", "me fala mais sobre esse", "o que tem nesse?", "mais informações" = usuário quer INFORMAÇÃO. Mostre os dados do frete. NÃO peça confirmação nem chame contratar_frete.
- "Quero esse", "quero o segundo", "quero fechar", "me interessa", "quero pegar" = usuário quer CONTRATAR. Aí sim use o fluxo de confirmação abaixo.
- "Me passa o número/contato/WhatsApp do embarcador" após escolha de frete = intenção de CONTRATAR. NUNCA passe o contato; peça confirmação do frete e, após confirmação explícita, chame contratar_frete.

AO APRESENTAR FRETES (OBRIGATÓRIO):
- MOSTRE TODOS os fretes que a ferramenta retornou. Se retornou 30, mostre os 30. Se retornou 8, mostre os 8. NUNCA resuma, NUNCA mostre só 3 ou 5 "principais". O caminhoneiro precisa do máximo de opções possível.
- NUNCA diga "aqui estão os melhores" ou "tem mais uns" omitindo fretes — liste TODOS.
- NUNCA use números para listar (1., 2., 3.). Use bullet (•) ou traço (-).
- Mesmo que não sejam da rota exata, mostre todos — podem servir.
- Fale de forma natural: "Olha, achei uns fretes aqui...", "Dá uma olhada nesses...", "Não achei exatamente o que você pediu, mas tem uns próximos que podem te interessar".
- Evite frases como "Se quiser, posso ajudar" ou "Posso buscar em outras rotas" no final — soa robótico. Se for oferecer mais ajuda, seja mais natural.

AO CONTRATAR FRETE (duas etapas obrigatórias):
1. PRIMEIRA MENSAGEM: Quando o usuário demonstrar intenção de CONTRATAR (não só ver detalhes):
   - Mostre TODOS os dados desse frete (origem, destino, preço, transportador, tipo de carga, veículo, data) e peça confirmação de forma natural.
NUNCA na hora da confirmação diga "entrar em contato com o embarcador" — isso só vem depois, quando o frete for confirmado. Na confirmação, seja direto e humano.
Exemplos de frases naturais: "Beleza, o frete é São Paulo → Curitiba, R$ 1.234, G10. É esse mesmo? Confirma pra eu fechar.", "Quer esse? Confirma pra mim."
Evite: "Confirma pra eu entrar em contato com o embarcador" — soa robótico e atrapalha.
Se o usuário pedir o contato do embarcador nessa etapa, negue o contato e mantenha o pedido de confirmação: "Não consigo passar o contato direto, mas se for esse frete eu fecho pra você agora. Confirma esse?"
2. SEGUNDA MENSAGEM: Só chame contratar_frete quando o usuário CONFIRMAR (ex: "sim", "confirmo", "é esse", "pode fechar"). Nunca chame contratar_frete na primeira mensagem de intenção.
- Após chamar contratar_frete com sucesso, responda exatamente o que a ferramenta retornar (mensagem de que entrou em contato com o embarcador).
- NUNCA informe o contato do embarcador, mesmo que o usuário peça.
- Nunca invente dados de frete — use sempre o índice da lista que você mostrou.

Responda sempre em português brasileiro, como um colega falando com outro.

FORMATO DE SAÍDA (ÚNICO PERMITIDO — NÃO HÁ OUTRA OPÇÃO):
O sistema só aceita respostas neste formato. Você NUNCA pode responder em JSON, markdown estruturado ou outro formato. Sua saída será sempre interpretada como mensagens separadas pelo delimitador abaixo.

Entre cada mensagem separada, use exatamente a linha ---MESSAGE--- em uma linha sozinha. Isso permite enviar cada parte como mensagem separada ao usuário.

Quando a ferramenta pesquisar_fretes retornar JSON com array "fretes":
1. Primeira mensagem: intro curta (ex: "Beleza, achei uns fretes aqui...")
2. ---MESSAGE---
3. Para CADA frete do array: uma mensagem separada. FORMATO WHATSAPP (usa * para negrito, não **):

   TRANSPORTADORA (regra especial):
   - Se informada: só o nome em *negrito*, sem rótulo. Ex: *G10* ou *Lontano Transportes*
   - Se não informada (null, vazio, UNKNOWN): "Transportadora não informada" (sem negrito)

   Demais campos (com emoji e rótulo):
   📍 Rota: {origem} → {destino}
   📦 Produto: {valor ou "Não informado"}
   💰 Valor: R$ X,XX ou "Não informado"
   🚚 Tipo de veículo: {valor ou "Não informado"}
   ⚖️ Peso: {valor + unidade ou "Não informado"}
   📅 Data: {DD/MM/YYYY ou "Não informado"}

   VALORES VAZIOS: UNKNOWN, NULL, null, vazio ou "N/A" → sempre escreva "Não informado" (sem negrito).

   Exemplo de frete formatado:
   *Lontano Transportes*
   📍 Rota: Rio Verde-GO → Santos-SP
   📦 Produto: Sementes
   💰 Valor: R$ 314,00
   🚚 Tipo de veículo: Não informado
   ⚖️ Peso: Não informado
   📅 Data: 07/03/2026

4. ---MESSAGE--- entre cada frete
5. Última mensagem: fechamento curto (ex: "Qualquer um te interessa, me fala!")

Data: converta timestamp para formato brasileiro DD/MM/YYYY. Use apenas \\n para quebras de linha. Mensagens no WhatsApp têm limite de ~4096 caracteres — mantenha conciso.

Quando NÃO houver fretes (cumprimentos, confirmações, fora de fretes, erro da tool): responda normalmente, sem ---MESSAGE--- (será uma única mensagem).

Lembre-se: o formato de saída é fixo. Texto puro com ---MESSAGE--- quando houver múltiplas partes. Nada mais.`;

const compiled = createReactAgent({
  llm,
  tools: [pesquisarFretesTool, contratarFreteTool, cotacaoFreteTool],
  prompt: SYSTEM_PROMPT,
  checkpointer,
});

export const agent = compiled;

function logMessage(msg: BaseMessage): void {
  const role = "role" in msg ? msg.role : msg._getType?.() ?? "unknown";
  if (role === "human" || msg instanceof HumanMessage) {
    const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
    log.agent("Usuário disse:", content.slice(0, 200) + (content.length > 200 ? "..." : ""));
    return;
  }
  if (role === "ai" || (msg as AIMessage).content !== undefined) {
    const ai = msg as AIMessage;
    const content = typeof ai.content === "string" ? ai.content : "";
    if (content) {
      log.thinking(content);
    }
    const toolCalls = (ai as { tool_calls?: Array<{ name?: string; args?: unknown }> }).tool_calls;
    if (toolCalls?.length) {
      for (const tc of toolCalls) {
        log.tool(`Chamando "${tc.name}" com args:`, JSON.stringify(tc.args ?? {}, null, 2));
      }
    }
    return;
  }
  if (role === "tool") {
    const content = typeof (msg as { content?: string }).content === "string" ? (msg as { content: string }).content : "";
    log.tool("Resultado da tool:", content.slice(0, 300) + (content.length > 300 ? "..." : ""));
  }
}

const MESSAGE_DELIMITER = "---MESSAGE---";
const CLOSING_MESSAGE_PHRASE = "qualquer um te interessa, me fala";

const messagesSchema = z.object({
  messages: z.array(z.string()).describe("Array de mensagens para enviar separadamente no WhatsApp"),
});

async function splitIntoMessages(content: string): Promise<string[]> {
  const splitterLlm = new ChatOpenAI({
    apiKey: agentEnv.openai.apiKey(),
    model: agentEnv.openai.model(),
    temperature: 0,
  });
  const structuredLlm = splitterLlm.withStructuredOutput(messagesSchema);

  const prompt = `O texto abaixo é a resposta do agente Rodezio para um caminhoneiro. Divida em mensagens separadas para enviar no WhatsApp.

Regras:
1. A introdução antes de qualquer lista de fretes = 1 mensagem.
2. Cada card de frete (que tem Transportadora, Rota, Produto, Valor, etc) = 1 mensagem separada.
3. O fechamento após a lista = 1 mensagem.

Retorne um objeto JSON com a chave "messages" contendo array de strings. Cada string = uma mensagem.

TEXTO:
${content}`;

  const result = await structuredLlm.invoke([{ role: "user", content: prompt }]);
  const messages = result.messages ?? [];
  return normalizeMessages(messages.length ? messages : [content.trim()]);
}

function parseMessages(content: string): string[] {
  if (!content || typeof content !== "string") return [];
  if (!content.includes(MESSAGE_DELIMITER)) {
    return normalizeMessages(content.trim() ? [content.trim()] : []);
  }
  const parts = content
    .split(MESSAGE_DELIMITER)
    .map((s) => s.trim())
    .filter(Boolean);
  return normalizeMessages(parts.length ? parts : [content.trim()]);
}

function sanitizeMessage(message: string): string {
  let normalized = message.replace(/\r\n/g, "\n").trim();

  // WhatsApp interpreta negrito com *texto*; evitamos **texto**.
  normalized = normalized.replace(/\*\*([^*]+?)\*\*/g, "*$1*");
  normalized = normalized.replace(/\b(?:UNKNOWN|NULL|N\/A)\b/gi, "Não informado");

  // Para transportadora ausente, padroniza o texto final sem rótulo.
  normalized = normalized.replace(
    /^\s*🚛?\s*\*{0,2}Transportadora:?\*{0,2}\s*Não informado\s*$/gim,
    "Transportadora não informada",
  );
  normalized = normalized.replace(
    /^\s*Transportadora:?\s*Não informado\s*$/gim,
    "Transportadora não informada",
  );

  return normalized.trim();
}

function isLikelyFreightCard(message: string): boolean {
  return message.includes("Rota:") && (message.includes("Valor:") || message.includes("Produto:"));
}

function splitClosingFromFreightCard(message: string): string[] {
  const lower = message.toLowerCase();
  const phraseIndex = lower.lastIndexOf(CLOSING_MESSAGE_PHRASE);
  if (phraseIndex <= 0) return [message];

  const before = message.slice(0, phraseIndex).trim();
  const closing = message.slice(phraseIndex).trim();
  if (!before || !closing) return [message];
  if (!isLikelyFreightCard(before)) return [message];
  return [before, closing];
}

function normalizeMessages(messages: string[]): string[] {
  return messages
    .flatMap((message) => splitClosingFromFreightCard(sanitizeMessage(message)))
    .map((message) => message.trim())
    .filter(Boolean);
}

function needsSplitByLlm(content: string): boolean {
  return (
    content.length > 200 &&
    (content.includes("Rota:") || content.includes("Transportadora") || content.includes("**Rota:**"))
  );
}

async function resolveMessages(content: string): Promise<string[]> {
  if (!content || typeof content !== "string") return [];
  const trimmed = content.trim();
  if (!trimmed) return [];

  if (content.includes(MESSAGE_DELIMITER)) {
    return parseMessages(content);
  }

  if (needsSplitByLlm(content)) {
    try {
      const split = await splitIntoMessages(content);
      log.info("runAgent: splitIntoMessages retornou", split.length, "mensagens");
      return split;
    } catch (err) {
      log.warn("runAgent: splitIntoMessages falhou, usando fallback:", err instanceof Error ? err.message : String(err));
      return normalizeMessages([trimmed]);
    }
  }

  return normalizeMessages([trimmed]);
}

/**
 * Run the agent with the given user input and return messages to send separately.
 * @param userInput - Mensagem do usuário
 * @param options.log - Se true, usa stream e exibe logs passo a passo (incluindo pensamento da IA)
 */
export async function runAgent(
  userInput: string,
  options?: { log?: boolean; threadId?: string },
): Promise<{ messages: string[] }> {
  const useLogs = options?.log ?? (process.env.RODEZIO_DEBUG === "true" || process.env.DEBUG === "true");
  const threadId = options?.threadId || randomUUID();

  // Config com thread_id para memória de conversa
  const config = { configurable: { thread_id: threadId } };

  log.info(`runAgent: iniciando (modo log=${useLogs}, threadId=${threadId})`);

  try {
    if (!useLogs) {
      log.info("runAgent: chamando LLM (modo invoke, sem stream)...");
      const result = await runWithThreadId(threadId, () =>
        compiled.invoke(
          { messages: [new HumanMessage(userInput)] },
          config,
        ),
      );
      const messages = result.messages ?? [];
      log.info("runAgent: LLM retornou", messages.length, "mensagens");
      const last = messages[messages.length - 1];
      if (last && "content" in last && typeof last.content === "string") {
        const messagesOut = await resolveMessages(last.content);
        log.info("runAgent: resposta extraída (", messagesOut.length, "mensagens)");
        return { messages: messagesOut.length ? messagesOut : [""] };
      }
      log.warn("runAgent: última mensagem sem content string, retornando vazio");
      return { messages: [""] };
    }

    log.step("Iniciando agente ReAct (stream)...");
    log.agent("Pergunta do usuário:", userInput);

    let lastContent = "";
    let prevLen = 1;
    let chunkCount = 0;
    const stream = await runWithThreadId(threadId, () =>
      compiled.stream(
        { messages: [new HumanMessage(userInput)] },
        { ...config, streamMode: "values" },
      ),
    );
    for await (const chunk of stream) {
      chunkCount++;
      const messages = (chunk as { messages?: BaseMessage[] }).messages ?? [];
      for (let i = prevLen; i < messages.length; i++) {
        const msg = messages[i];
        if (msg) logMessage(msg);
      }
      prevLen = messages.length;
      const last = messages[messages.length - 1];
      if (last && "content" in last && typeof last.content === "string") {
        lastContent = last.content;
      }
    }

    log.info("runAgent: stream finalizado (", chunkCount, "chunks,", prevLen, "mensagens)");
    log.step("Agente finalizou.");
    const messagesOut = await resolveMessages(lastContent);
    return { messages: messagesOut.length ? messagesOut : [""] };
  } catch (err) {
    log.error("runAgent: erro —", err instanceof Error ? err.message : String(err));
    if (err instanceof Error && err.stack) {
      console.error("runAgent stack:", err.stack);
    }
    throw err;
  }
}
