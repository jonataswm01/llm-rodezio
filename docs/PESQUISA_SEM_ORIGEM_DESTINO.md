# Pesquisa de Frete sem Origem/Destino

Documento de discussão: quando o usuário pede frete sem informar origem nem destino, como ajudar usando contexto do histórico?

---

## 1. Contexto do problema

**Situação:** Usuário diz algo como "tem frete?", "o que tem?", "me mostra uns fretes", "quero ver fretes" — sem mencionar origem ou destino.

**Ideia:** 
- Nova tool conectada ao ES que busca **apenas por data** (sem filtro de origem/destino)
- Usar dados do histórico para inferir rota de interesse e fazer busca **silenciosa** (sem falar pro usuário)
- Exemplo: usuário só pediu "fretes de Maringá para Paranaguá", visualizou, não comentou nada. Na próxima mensagem "tem frete?" → IA usa Maringá→Paranaguá silenciosamente e mostra "Dá uma olhada nos fretes que temos disponíveis [lista Maringá→Paranaguá]"

---

## 2. Variáveis e fontes de dados disponíveis

### 2.1 SearchCache (Redis, TTL 1h)

| Campo | Descrição | Quando está preenchido |
|-------|-----------|------------------------|
| `rota.origin` | Cidade de origem da última pesquisa | `pesquisar_fretes` (query completa) ou `pesquisar_fretes_flexivel` modo "origem" |
| `rota.destination` | Cidade de destino da última pesquisa | `pesquisar_fretes` (query completa) ou `pesquisar_fretes_flexivel` modo "destino" |
| `fretes` | Array dos fretes retornados na última pesquisa | Sempre que há resultado |

**Limitação:** Só guarda a **última** pesquisa. Se o usuário fez 3 pesquisas na conversa, só a mais recente está no cache.

**Caso pesquisar_fretes_flexivel:** Quando modo=origem → `destination` fica `undefined`. Quando modo=destino → `origin` fica `undefined`. Ou seja, nunca temos origem E destino no cache se a última pesquisa foi flexível.

---

### 2.2 Histórico de mensagens (checkpointer)

| Fonte | O que contém |
|-------|--------------|
| **HumanMessage** | Texto do usuário: "fretes de Maringá para Paranaguá", "tem frete?", "quero esse" |
| **AIMessage (tool_calls)** | Chamadas: `pesquisar_fretes` com `query: "fretes de Maringá para Paranaguá"`, ou `pesquisar_fretes_flexivel` com `modo`, `localizacao` |
| **AIMessage (content)** | Resposta do assistente (lista de fretes, confirmações) |
| **ToolMessage** | Resultado bruto da tool (JSON com fretes) — **omitido** no formatMessagesToCleanHistory |

O `formatMessagesToCleanHistory` formata como:
- `Usuário: [texto]`
- `Assistente: [chamando pesquisar_fretes com query: fretes de Maringá para Paranaguá]`

**Decisão:** Usar apenas a última pesquisa (cache). Não parsear histórico de tool_calls.

---

### 2.3 ConversationSummary (LLM)

Resumo em 2-4 frases da conversa. Útil para contexto qualitativo, mas não estruturado para extrair origem/destino de forma confiável.

---

## 3. Cenários de interação do usuário (variáveis de "engajamento")

| Cenário | Descrição | Nível de confiança para reutilizar rota |
|---------|-----------|----------------------------------------|
| **Apenas visualizou** | Usuário pediu "fretes de Maringá para Paranaguá", IA mostrou lista, usuário não respondeu nada (ou só "ok", "beleza") | Médio — pode ter sido exploração |
| **Visualizou e mudou de assunto** | Depois de ver os fretes, falou de outra coisa ("e o pedágio?", "tem frete pra Santos?") | Baixo para a rota anterior |
| **Demonstrou interesse explícito** | "quero esse", "me interessa o segundo", "quero falar com o embarcador" | Alto — mas aí já tem fluxo de conectar |
| **Rejeitou** | "não gostei", "não serve", "tem outro?", "nada disso" | Não usar essa rota |
| **Pediu mais da mesma rota** | "tem mais?", "outros fretes dessa rota?" | Alto |
| **Pediu rota diferente** | "e de X para Y?", "pesquisa Santos" | A rota nova substitui |
| **Múltiplas pesquisas sem feedback** | Pesquisou Maringá→Paranaguá, depois São Paulo→Curitiba, só visualizou | **Última sempre** (cache) |

---

## 4. Nova tool: busca aberta + lógica da IA

### 4.1 Tool `pesquisar_fretes_aberto`

- **Função:** Busca fretes com **único filtro** = mais recentes (ordenados por data).
- **Query ES:** Sem origem/destino. Apenas ordenação `timestamp desc`, `price desc`.
- **Limite:** 8 fretes (menos que as pesquisas normais, que retornam 15).
- **Objetivo:** Ferramenta auxiliar para quando o usuário pedir frete sem informar rota — funciona como "atrativo" para engajar. Quando o usuário fizer pesquisa normal (com rota), mostra os 15 fretes.
- **Quando usar:** (1) Usuário pede frete sem origem/destino e não há histórico; (2) Usuário explicitamente pede ver fretes abertos/recentes.

### 4.2 Decisão da IA (contexto + última pesquisa no cache)

A IA usa o **cache da última pesquisa** (não parseia histórico antigo). Prioridade: **sempre a última**.

| Situação no cache | Ação |
|-------------------|------|
| Tem origem **e** destino | Chama `pesquisar_fretes` com essa rota silenciosamente |
| Tem só origem | Chama `pesquisar_fretes_flexivel` modo "origem" silenciosamente |
| Tem só destino | Chama `pesquisar_fretes_flexivel` modo "destino" silenciosamente |
| Não tem histórico de rota | Chama `pesquisar_fretes_aberto` (8 fretes mais recentes) |

### 4.3 Mensagem ao usuário (sem revelar a rota)

**Regra:** Nunca dizer "olha busquei aqui de X pra Y" — o usuário não pediu isso.

- ✅ "Olha, achei esses fretes. Vê se algum te interessa."
- ✅ "Dá uma olhada nesses... se algum te chamar atenção, manda!"  
- ❌ "Busquei de Maringá pra Paranaguá que você tava vendo..."

---

## 5. Decisões (perguntas resolvidas)

| # | Pergunta | Decisão |
|---|----------|---------|
| 1 | **Prioridade de rotas:** Se o usuário pesquisou A→B e depois C→D, qual usar? | Usar a **última** sempre |
| 2 | **Transparência:** Revelar que usamos a rota do histórico? | **Não.** Nunca revelar. Sempre falar de forma genérica ("olha achei esses fretes, vê se algum te interessa") |
| 3 | **Cache vs histórico:** Parsear histórico de tool_calls para rotas antigas? | **Não.** Usar apenas a última pesquisa (cache) |
| 4 | **Rota incompleta:** Última pesquisa foi só origem ou só destino, combinar com histórico? | **Não.** Usar `pesquisar_fretes_flexivel` com o que está no cache (origem ou destino) |
| 5 | **Fallback:** Sem histórico, usar tool aberta ou pedir rota ao usuário? | **Sim.** Usar `pesquisar_fretes_aberto` — 8 fretes mais recentes, como "atrativo". Pesquisa normal continua mostrando 15 |

---

## 6. Notas da discussão

_(espaço para anotações)_ 
