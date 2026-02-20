# LLM Rodezio

API REST desenvolvida em Node.js com TypeScript que integra um agente de IA usando LangGraphJS e OpenAI, com observabilidade completa via LangSmith.

## 📋 Sobre o Projeto

O **LLM Rodezio** é uma aplicação backend que combina uma API REST moderna com um agente de IA baseado em LangGraph. O projeto demonstra como construir agentes inteligentes usando tecnologias de ponta do ecossistema LangChain, com foco em observabilidade e desenvolvimento ágil.

### Principais Funcionalidades

- **API REST** com Fastify e documentação Swagger automática
- **Agente de IA** usando LangGraphJS para orquestração de workflows
- **Integração OpenAI** para processamento de linguagem natural
- **Observabilidade** com LangSmith para rastreamento e análise de execuções
- **TypeScript** para type-safety e melhor DX
- **Validação de schemas** com Zod

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
│   ├── agents/
│   │   └── langgraph/          # Agente LangGraph isolado
│   │       ├── config.ts        # Configuração de env vars
│   │       ├── graph.ts          # Definição do grafo LangGraph
│   │       ├── index.ts          # Entrypoint do agente
│   │       └── README.md         # Documentação do agente
│   ├── routes.ts                # Rotas da API
│   ├── server.ts                # Servidor Fastify
│   └── types.ts                 # Tipos TypeScript
├── dist/                        # Build TypeScript (gerado)
├── .env.example                 # Exemplo de variáveis de ambiente
├── package.json
├── tsconfig.json
└── README.md
```

## 🚀 Como Usar

### Pré-requisitos

- Node.js 18+ 
- pnpm instalado (`npm install -g pnpm`)

### Instalação

1. Clone o repositório:
```bash
git clone git@github.com:jonataswm01/llm-rodezio.git
cd llm-rodezio
```

2. Instale as dependências:
```bash
pnpm install
```

3. Configure as variáveis de ambiente:
```bash
cp .env.example .env
# Edite o .env com suas chaves de API
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

Ao executar `pnpm agent:dev`, o navegador abre automaticamente o projeto no LangSmith Studio.

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

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues ou pull requests.

## 📄 Licença

ISC
