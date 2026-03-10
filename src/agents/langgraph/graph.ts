import { createReactAgent } from "@langchain/langgraph/prebuilt";
import type { AIMessage, BaseMessage } from "@langchain/core/messages";
import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { randomUUID } from "node:crypto";
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
- NÃO FAZEMOS: NÃO liberamos o contato do embarcador — se o usuário pedir, diga que não temos ou que não é liberado. Assuntos genéricos fora de fretes e estrada também não atendemos.

COTAÇÃO DE FRETE:
- Quando identificar intenção de COTAÇÃO (ex: "quero cotar", "preciso de cotação", "quanto custa frete de X para Y", "quero uma cotação"), chame a ferramenta cotacao_frete.
- Passe dadosCotacao (origem, destino, tipoCarga) APENAS se o usuário mencionou na mensagem — se não mencionou, não passe nada e NÃO pergunte.
- Após a ferramenta retornar, responda direcionando o usuário a entrar em contato com o Jonatas no (16) 99733-0113 para falar sobre esse assunto. Use o tom humano e o que a ferramenta retornou.
- O contato do Jonatas (16) 99733-0113 é EXCLUSIVO para cotação. NUNCA o informe em qualquer outra situação.

CONTATO DO EMBARCADOR E OUTROS:
- Qualquer outra solicitação de contato (embarcador, telefone, WhatsApp do frete, etc.): NÃO. Não pode, não tem, restrito.
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
- Quando o usuário usa estado/sigla, está indeciso — precisa ver mais opções. Mostre todos os fretes retornados (até 15), nunca resuma ou limite a poucos.

Quando a pergunta NÃO for sobre fretes (cumprimentos, dúvidas gerais), responda direto sem usar ferramentas.

DIFERENCIE AS INTENÇÕES:
- "Quero ver detalhes", "me fala mais sobre esse", "o que tem nesse?" = usuário só quer INFORMAÇÃO. Mostre os dados do frete, mas NÃO peça confirmação nem chame contratar_frete.
- "Quero esse", "quero o segundo", "quero fechar", "me interessa", "quero pegar" = usuário quer CONTRATAR. Aí sim use o fluxo de confirmação abaixo.

AO APRESENTAR FRETES:
- Sempre mostre todas as opções que a ferramenta retornou (até 15). O usuário quer ver bastante para escolher — nunca resuma, omita ou diga "aqui estão os melhores".
- NUNCA use números para listar (1., 2., 3.). Use bullet (•) ou traço (-). A ferramenta já retorna no formato correto.
- Mesmo que não sejam da rota exata, mostre todos — podem servir.
- Fale de forma natural: "Olha, achei uns fretes aqui...", "Dá uma olhada nesses...", "Não achei exatamente o que você pediu, mas tem uns próximos que podem te interessar".
- Evite frases como "Se quiser, posso ajudar" ou "Posso buscar em outras rotas" no final — soa robótico. Se for oferecer mais ajuda, seja mais natural.

AO CONTRATAR FRETE (duas etapas obrigatórias):
1. PRIMEIRA MENSAGEM: Quando o usuário demonstrar intenção de CONTRATAR (não só ver detalhes), mostre TODOS os dados desse frete da lista (origem, destino, preço, transportador, tipo de carga, veículo, data) e peça confirmação de forma natural.
NUNCA na hora da confirmação diga "entrar em contato com o embarcador" — isso só vem depois, quando o frete for confirmado. Na confirmação, seja direto e humano.
Exemplos de frases naturais: "É esse mesmo? Confirma pra eu fechar.", "Quer esse? Confirma pra mim.", "Beleza, é esse que você quer? Confirma pra eu fechar."
Evite: "Confirma pra eu entrar em contato com o embarcador" — soa robótico e atrapalha.
2. SEGUNDA MENSAGEM: Só chame contratar_frete quando o usuário CONFIRMAR (ex: "sim", "confirmo", "é esse", "pode fechar"). Nunca chame contratar_frete na primeira mensagem de intenção.
- Após chamar contratar_frete com sucesso, responda exatamente o que a ferramenta retornar (mensagem de que entrou em contato com o embarcador).
- NUNCA informe o contato do embarcador, mesmo que o usuário peça.
- Nunca invente dados de frete — use sempre o índice da lista que você mostrou.

Responda sempre em português brasileiro, como um colega falando com outro.`;

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

/**
 * Run the agent with the given user input and return the assistant reply text.
 * @param userInput - Mensagem do usuário
 * @param options.log - Se true, usa stream e exibe logs passo a passo (incluindo pensamento da IA)
 */
export async function runAgent(userInput: string, options?: { log?: boolean; threadId?: string }): Promise<string> {
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
        log.info("runAgent: resposta extraída (length:", last.content.length, ")");
        return last.content;
      }
      log.warn("runAgent: última mensagem sem content string, retornando vazio");
      return "";
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
    return lastContent;
  } catch (err) {
    log.error("runAgent: erro —", err instanceof Error ? err.message : String(err));
    if (err instanceof Error && err.stack) {
      console.error("runAgent stack:", err.stack);
    }
    throw err;
  }
}
