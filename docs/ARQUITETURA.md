# Arquitetura do Projeto Rodezio

Documentação estruturada para entender o projeto LLM Rodezio.

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Diagrama de Alto Nível](#2-diagrama-de-alto-nível)
3. [Estrutura de Arquivos](#3-estrutura-de-arquivos)
4. [Fluxo de Dados](#4-fluxo-de-dados)
5. [Componentes Principais](#5-componentes-principais)
6. [Formas de Uso](#6-formas-de-uso)
7. [Configuração](#7-configuração)

---

## 1. Visão Geral

| Aspecto | Descrição |
|---------|-----------|
| **O que é** | API REST + Agente multi-agêntico ReAct (LangGraph) com pesquisa de fretes |
| **Stack** | Node.js, TypeScript, Fastify, LangGraphJS, OpenAI, Elasticsearch |
| **Propósito** | Agente conversacional que responde perguntas e pesquisa fretes no ES quando necessário |

### Em uma frase

> O Rodezio é um agente ReAct que recebe mensagens via HTTP ou CLI, pensa e decide: se a pergunta exige fretes, usa a tool `pesquisar_fretes` (Agente 2) para buscar no Elasticsearch; caso contrário, responde diretamente.

---

## 2. Diagrama de Alto Nível

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            LLM RODEZIO (Multi-Agente)                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ENTRADAS                    PROCESSAMENTO                          SAÍDAS     │
│   ────────                    ─────────────                          ──────     │
│                                                                                  │
│   POST /agent  ──┐                                                               │
│   (API)         │    ┌──────────────┐    ┌─────────────────────┐                 │
│                 ├───►│   Fastify    │───►│  Agente 1 (ReAct)   │───►  Resposta   │
│   pnpm agent:dev│    │   (3333)     │    │  pensar → agir →    │      (JSON ou  │
│   (CLI)         │    └──────────────┘    │  observar (loop)    │       console)  │
│                 │                        └──────────┬──────────┘                 │
│   LangGraph     │                                   │                            │
│   Studio        │              ┌────────────────────┼────────────────────┐        │
│   (2024)        │              │                    │                    │        │
│                 └──────────────┤                    ▼                    │        │
│                                │         ┌──────────────────┐           │        │
│                                │         │  Tool:           │           │        │
│                                │         │  pesquisar_fretes │           │        │
│                                │         │  (Agente 2)       │           │        │
│                                │         └────────┬─────────┘           │        │
│                                │                  │                      │        │
│                                │    ┌─────────────┼─────────────┐       │        │
│                                │    ▼             ▼             ▼       │        │
│                                │  OpenAI    Elasticsearch   API SAG     │        │
│                                │  (GPT)     (index fretes)  (lat/long)  │        │
│                                │    └─────────────┬─────────────┘       │        │
│                                │                  │                      │        │
│                                │                  ▼                      │        │
│                                │         ┌──────────────────┐           │        │
│                                └────────►│  LangSmith        │  (opcional)        │
│                                          └──────────────────┘                    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Estrutura de Arquivos

```
llm-rodezio/
│
├── src/
│   ├── server.ts              # Inicializa Fastify, registra plugins e rotas
│   ├── routes.ts              # Definição das rotas HTTP (users, agent)
│   ├── types.ts               # Tipos TypeScript (FastifyTypedInstance)
│   │
│   ├── config/
│   │   └── langsmith.ts       # Inicialização e helpers do LangSmith
│   │
│   └── agents/
│       └── langgraph/
│           ├── config.ts      # Variáveis de ambiente (OpenAI, ES, SAG, LangSmith)
│           ├── graph.ts       # Agente 1 ReAct + tools (createReactAgent)
│           ├── graph-studio.ts # Entrypoint para LangGraph Studio (re-exporta graph)
│           ├── index.ts       # Entrypoint CLI + exporta runAgent
│           ├── tools/
│           │   └── pesquisar-fretes.ts  # Tool Agente 2 (pesquisa ES)
│           ├── services/
│           │   ├── elasticsearch.ts     # Cliente ES, busca no index fretes
│           │   └── location-api.ts      # API sag-backend (lat/long)
│           └── README.md      # Documentação do agente
│
├── docs/
│   ├── ARQUITETURA.md         # Este documento
│   └── RODEZIO_MULTI_AGENT.md # Requisitos e entendimento do multi-agente
│
├── langgraph.json             # Config LangGraph CLI (aponta para graph-studio)
├── .env.example               # Exemplo de variáveis de ambiente
├── package.json
├── tsconfig.json
└── README.md
```

### Responsabilidade de cada arquivo

| Arquivo | Responsabilidade |
|---------|-------------------|
| `server.ts` | Boot do servidor, CORS, Swagger, registro de rotas |
| `routes.ts` | Handlers de `/users` e `/agent`, validação Zod |
| `config/langsmith.ts` | Ativa/desativa tracing, define LANGCHAIN_* |
| `agents/langgraph/config.ts` | Lê e valida OPENAI_*, ELASTICSEARCH_*, SAG_BACKEND_*, LANGSMITH_* |
| `agents/langgraph/graph.ts` | Agente 1 ReAct com tool `pesquisar_fretes`, define `runAgent()` |
| `agents/langgraph/graph-studio.ts` | Inicializa LangSmith e re-exporta `agent` de graph.ts |
| `agents/langgraph/tools/pesquisar-fretes.ts` | Tool Agente 2: extrai params, resolve geolocalização, busca ES |
| `agents/langgraph/services/elasticsearch.ts` | Cliente ES, busca fretes com ordenação (timestamp desc, price desc) |
| `agents/langgraph/services/location-api.ts` | Cliente HTTP para sag-backend (states, cities com lat/long) |
| `agents/langgraph/index.ts` | CLI: lê input, chama `runAgent`, abre LangSmith |

---

## 4. Fluxo de Dados

### 4.1 Fluxo do Agente (ReAct)

```
                    ┌─────────┐
                    │  START  │
                    └────┬────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  Nó "agent"         │
              │  LLM: pensar +      │
              │  tool_calls?        │
              └─────────┬───────────┘
                        │
                        ├─── sem tool_calls ───► END (resposta final)
                        │
                        └─── com tool_calls ───► Nó "tools"
                                                    │
                                                    │  pesquisar_fretes(query)
                                                    │  → extrai params (LLM)
                                                    │  → location API (lat/long)
                                                    │  → Elasticsearch
                                                    │
                                                    ▼
                                              ┌─────────────┐
                                              │  ToolMessage│
                                              └──────┬─────┘
                                                     │
                                                     ▼
                                              volta ao "agent"
                                        (observar → pensar → ...)
```

- **Estado**: `MessagesAnnotation` (array de mensagens Human/AI/Tool)
- **Nós**: `agent` (LLM com tool calling) e `tools` (ToolNode)
- **Loop ReAct**: agent → tools → agent até o modelo retornar resposta final (sem tool_calls)

### 4.2 Fluxo da requisição POST /agent

```
Cliente HTTP
    │
    │  POST /agent { "message": "fretes de São Paulo para Curitiba" }
    ▼
routes.ts (handler)
    │
    │  runAgent(message)
    ▼
graph.ts → createReactAgent.invoke({ messages: [HumanMessage] })
    │
    │  Agente 1 (ReAct): decide usar pesquisar_fretes
    │  → Tool: extrai params, chama location API, busca ES
    │  → Retorna 2–15 fretes
    │  → Agente 1 sintetiza resposta final
    ▼
graph.ts → extrai último AIMessage
    │
    │  return content
    ▼
routes.ts → reply.send({ response: "..." })
```

---

## 5. Componentes Principais

### 5.1 API REST (Fastify)

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/users` | GET | Lista usuários (em memória) |
| `/users` | POST | Cria usuário (em memória) |
| `/agent` | POST | Envia mensagem ao agente, retorna resposta |
| `/docs` | GET | Documentação Swagger/OpenAPI |

### 5.2 Agente LangGraph (Multi-Agente)

| Conceito | Implementação |
|----------|----------------|
| **Framework** | LangGraphJS (`createReactAgent`) |
| **Agente 1** | Rodezio (Orquestrador ReAct) |
| **Agente 2** | Tool `pesquisar_fretes` (pesquisa fretes no ES) |
| **Estado** | `MessagesAnnotation` |
| **LLM** | `ChatOpenAI` (OpenAI) |
| **Modelo padrão** | `gpt-4.1-mini` (via config) |
| **Regras fretes** | Mín 2, máx 15; ordenação: mais recentes + maior preço |

### 5.3 Por que graph-studio.ts?

| Arquivo | Usado por | Motivo |
|---------|-----------|--------|
| `graph.ts` | API, CLI | Define o grafo ReAct com tools |
| `graph-studio.ts` | LangGraph Studio | Inicializa LangSmith e re-exporta `agent` de graph.ts |

O `langgraph.json` aponta para `graph-studio.js:agent`.

---

## 6. Formas de Uso

| Modo | Comando | Quando usar |
|------|---------|-------------|
| **API** | `pnpm dev` → `POST /agent` | Integração com frontend ou outros serviços |
| **CLI** | `pnpm agent:dev "pergunta"` | Testes rápidos no terminal |
| **Studio** | `pnpm studio:dev` | Debug visual, inspeção do grafo e do estado |

### Portas

| Serviço | Porta | URL |
|---------|-------|-----|
| API Fastify | 3333 | http://localhost:3333 |
| Swagger | 3333 | http://localhost:3333/docs |
| LangGraph Studio | 2024 | http://localhost:2024 |

---

## 7. Configuração

### Variáveis obrigatórias

| Variável | Descrição |
|----------|-----------|
| `OPENAI_API_KEY` | Chave da API OpenAI |

### Variáveis opcionais

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `OPENAI_MODEL` | `gpt-4.1-mini` | Modelo OpenAI |
| `ELASTICSEARCH_URL` | `http://localhost:9200` | URL do Elasticsearch |
| `ELASTICSEARCH_INDEX_FRETES` | `fretes` | Nome do index de fretes |
| `ELASTICSEARCH_GEO_RADIUS_KM` | `300` | Raio (km) para busca geo em origin/destination |
| `ELASTICSEARCH_USER` | — | Usuário (opcional; se informado com PASSWORD, usa auth) |
| `ELASTICSEARCH_PASSWORD` | — | Senha (opcional) |
| `SAG_BACKEND_URL` | `https://sag-backend.roduno.work` | API de localização (lat/long) |
| `LANGSMITH_API_KEY` | — | Chave LangSmith (ativa tracing) |
| `LANGSMITH_PROJECT` | `llm-rodezio-agent` | Nome do projeto no LangSmith |
| `LANGSMITH_WORKSPACE` | `default` | Nome do workspace |
| `LANGSMITH_WORKSPACE_ID` | — | UUID do workspace (mais preciso) |
| `LANGSMITH_PROJECT_ID` | — | UUID do projeto |
| `LANGSMITH_TRACING` | `true` se API key | Liga/desliga tracing |

### Ordem de carregamento

1. `server.ts` e `agents/langgraph/index.ts` importam `initializeLangSmith()` primeiro
2. `initializeLangSmith()` define `LANGCHAIN_TRACING_V2`, `LANGCHAIN_API_KEY`, etc.
3. O agente usa `agentEnv` de `config.ts` para OpenAI, Elasticsearch, SAG e LangSmith

---

## Resumo Rápido

```
Rodezio = API Fastify + Agente ReAct Multi-Agente + Elasticsearch + LangSmith (opcional)

Entrada:  mensagem de texto (HTTP ou CLI)
Processo: Agente 1 (ReAct) pensa → se precisa fretes, chama tool pesquisar_fretes (Agente 2)
          → tool busca no ES (com geolocalização via API SAG) → retorna 2–15 fretes
Saída:    resposta do modelo em texto (com ou sem fretes)
```
