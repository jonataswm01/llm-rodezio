# LLM Rodezio

API REST + Agente de IA (LangGraph + OpenAI) com observabilidade via LangSmith.

---

## 📖 Entendendo o Projeto

**Documentação estruturada:** [docs/ARQUITETURA.md](./docs/ARQUITETURA.md)

Lá você encontra:
- Diagrama de alto nível
- Estrutura de arquivos e responsabilidades
- Fluxo de dados (API e agente)
- Formas de uso e configuração

---

## 📋 Sobre o Projeto

O **LLM Rodezio** é um backend que combina API REST (Fastify) com um agente de IA baseado em LangGraph. O agente processa mensagens via OpenAI e pode enviar traces para o LangSmith.

### Principais Funcionalidades

| Aspecto | Tecnologia |
|---------|------------|
| API REST | Fastify + Swagger |
| Agente | LangGraphJS + OpenAI |
| Observabilidade | LangSmith |
| Validação | Zod |

## 🛠️ Tecnologias Utilizadas

### Backend & Runtime
- **Node.js** - Runtime JavaScript
- **TypeScript** - Superset do JavaScript com tipagem estática
- **Fastify** - Framework web rápido e eficiente para Node.js
- **pnpm** - Gerenciador de pacotes rápido e eficiente

### IA & LLM
- **LangGraphJS** (`@langchain/langgraph`) - Framework para construção de agentes com grafos de estado
- **LangChain Core** (`@langchain/core`) - Biblioteca base para integração com LLMs
- **OpenAI** (`@langchain/openai`) - Integração com modelos GPT da OpenAI
- **LangSmith** - Plataforma de observabilidade e rastreamento para aplicações LLM

### Validação & Documentação
- **Zod** - Biblioteca de validação de schemas TypeScript-first
- **Fastify Type Provider Zod** - Integração Zod com Fastify para validação automática
- **Swagger/OpenAPI** - Documentação automática da API
- **Scalar API Reference** - Interface moderna para documentação da API

### Desenvolvimento
- **tsx** - Executor TypeScript para desenvolvimento rápido
- **Biome** - Linter e formatter rápido e moderno
- **open** - Utilitário para abrir URLs no navegador

## 📁 Estrutura do Projeto

```
llm-rodezio/
├── src/
│   ├── agents/langgraph/       # Agente LangGraph
│   │   ├── config.ts            # Env vars (OpenAI, LangSmith)
│   │   ├── graph.ts             # Grafo principal (API + CLI)
│   │   ├── graph-studio.ts      # Grafo para LangGraph Studio
│   │   └── index.ts             # Entrypoint CLI
│   ├── config/langsmith.ts      # Inicialização LangSmith
│   ├── routes.ts                # Rotas HTTP
│   ├── server.ts                # Servidor Fastify
│   └── types.ts
├── docs/ARQUITETURA.md          # Documentação estruturada
├── langgraph.json               # Config LangGraph Studio
└── .env.example
```

Ver detalhes em [docs/ARQUITETURA.md](./docs/ARQUITETURA.md).

## 🚀 Início Rápido

```bash
pnpm install
cp .env.example .env   # Configure OPENAI_API_KEY
pnpm dev               # API em http://localhost:3333
```

Teste o agente: `POST http://localhost:3333/agent` com `{ "message": "Olá" }` ou use `pnpm agent:dev "Olá"`.

---

## 🚀 Como Usar

### Pré-requisitos

- Node.js 18+
- pnpm (`npm install -g pnpm`)

### Instalação

1. Clone e instale:
```bash
git clone git@github.com:jonataswm01/llm-rodezio.git
cd llm-rodezio
pnpm install
```

2. Configure o `.env`:
```bash
cp .env.example .env
# Edite e preencha OPENAI_API_KEY (obrigatório)
```

### Variáveis de Ambiente Necessárias

```env
# OpenAI (obrigatório)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# LangSmith (opcional, mas recomendado)
LANGSMITH_API_KEY=lsv2_...
LANGSMITH_PROJECT=llm-rodezio-agent
LANGSMITH_PROJECT_ID=uuid-do-projeto
LANGSMITH_WORKSPACE_ID=uuid-do-workspace
LANGSMITH_TRACING=true
```

### Executando o Servidor

```bash
# Modo desenvolvimento (com hot-reload)
pnpm dev

# Modo produção (após build)
pnpm build
pnpm start
```

O servidor estará disponível em `http://localhost:3333` e a documentação Swagger em `http://localhost:3333/docs`.

### Executando o Agente

```bash
# Modo desenvolvimento
pnpm agent:dev

# Com mensagem customizada
pnpm agent:dev "Sua pergunta aqui"

# Modo produção
pnpm agent:build
pnpm agent:start
```

Quando executado, o agente abre automaticamente o LangSmith Studio no navegador para visualização dos traces.

## 📡 Endpoints da API

### `GET /users`
Lista todos os usuários cadastrados.

### `POST /users`
Cria um novo usuário.

**Body:**
```json
{
  "name": "João Silva",
  "email": "joao@example.com"
}
```

### `POST /agent`
Envia uma mensagem para o agente de IA e recebe uma resposta.

**Body:**
```json
{
  "message": "Olá! Como você pode me ajudar?"
}
```

**Response:**
```json
{
  "response": "Olá! Sou um agente de IA..."
}
```

## 🔍 Observabilidade com LangSmith

O projeto está configurado para enviar traces automaticamente para o LangSmith quando as variáveis de ambiente estão configuradas. Isso permite:

- Visualizar cada execução do agente em tempo real
- Analisar latência e custos
- Debug de problemas em produção
- Criar datasets e avaliações

### Visualizando Traces

Ao executar `pnpm agent:dev`, o navegador abre automaticamente a página de traces do projeto no LangSmith.

### Testando no LangGraph Studio

Para testar o agente interativamente no **LangGraph Studio** (com interface visual e debug em tempo real):

1. **Compile o projeto** (se ainda não compilou):
```bash
pnpm agent:build
```

2. **Inicie o servidor de desenvolvimento do LangGraph**:
```bash
pnpm studio
```

Ou use o script completo que compila e inicia:
```bash
pnpm studio:dev
```

3. O servidor iniciará em `http://localhost:2024` e abrirá automaticamente o LangGraph Studio no navegador.

4. No Studio, você poderá:
   - Enviar mensagens e ver o agente responder em tempo real
   - Visualizar o grafo de execução passo a passo
   - Inspecionar estados intermediários
   - Fazer debug interativo

### Aviso: Erro de extração de schema

O LangGraph Studio pode exibir no terminal o erro `Failed to extract schema for "agent"` (causa: `Cannot read properties of undefined (reading 'flags')` em `getSymbolLinks`). Isso é um **bug conhecido** no parser do `@langchain/langgraph-api` ao usar a API interna do TypeScript para analisar módulos e extrair schemas.

**O agente continua funcionando normalmente**: você pode executar runs, visualizar o grafo e usar o Studio. O erro afeta apenas a extração automática de schemas para a UI (ex.: validação de input no chat).

**Workarounds documentados** (issue [#1383](https://github.com/langchain-ai/langgraphjs/issues/1383)):

- Para timeouts de schema: `LANGGRAPH_SCHEMA_RESOLVE_TIMEOUT_MS=120000` e `NODE_OPTIONS="--max-old-space-size=8192"`
- Downgrade de TypeScript (5.6 ou 5.7) **não resolve** este erro específico de `getSymbolLinks`
- O problema está no parser ao analisar dependências (`@langchain/openai`, `@langchain/core`, etc.); aguardar correção no `@langchain/langgraph-api`

## 🏗️ Arquitetura do Agente

O agente utiliza **LangGraphJS** para criar um grafo de execução simples:

```
User Input → LLM Node → Response
```

O estado do grafo é gerenciado através de `MessagesAnnotation`, que mantém um histórico de mensagens entre usuário e assistente.

## 📝 Scripts Disponíveis

- `pnpm dev` - Inicia o servidor em modo desenvolvimento
- `pnpm start` - Inicia o servidor em modo produção
- `pnpm build` - Compila TypeScript para JavaScript
- `pnpm format` - Formata o código com Biome
- `pnpm agent:dev` - Executa o agente em modo desenvolvimento
- `pnpm agent:build` - Compila o agente
- `pnpm agent:start` - Executa o agente compilado
- `pnpm studio` - Inicia o servidor LangGraph para testar no Studio (requer build prévio)
- `pnpm studio:dev` - Compila e inicia o servidor LangGraph para o Studio

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues ou pull requests.

## 📄 Licença

ISC
