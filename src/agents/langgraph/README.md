# LangGraph agent (Rodezio Multi-Agente)

Agente ReAct multi-agêntico com LangGraphJS e OpenAI. Quando a pergunta exige fretes, usa a tool `pesquisar_fretes` para buscar no Elasticsearch (index `fretes`). Geolocalização via API sag-backend.

## Variáveis de ambiente

Copie `.env.example` para `.env` e preencha:

- **OPENAI_API_KEY** (obrigatório): chave da API OpenAI.
- **OPENAI_MODEL** (opcional): modelo, padrão `gpt-4.1-mini`.
- **ELASTICSEARCH_URL** (opcional): URL do ES (padrão `http://localhost:9200`).
- **ELASTICSEARCH_INDEX_FRETES** (opcional): index de fretes (padrão `fretes`).
- **ELASTICSEARCH_GEO_RADIUS_ORIGEM_KM** (opcional): raio em km para busca geo em origem (padrão `150`).
- **ELASTICSEARCH_GEO_RADIUS_DESTINO_KM** (opcional): raio em km para busca geo em destino (padrão `50`).
- **ELASTICSEARCH_USER** e **ELASTICSEARCH_PASSWORD** (opcionais): autenticação. Se não informados, conecta sem auth.
- **SAG_BACKEND_URL** (opcional): API de localização (padrão `https://sag-backend.roduno.work`).
- **LANGSMITH_API_KEY** (opcional): para enviar traces ao LangSmith.
- **LANGSMITH_PROJECT** (opcional): nome do projeto no LangSmith (padrão `llm-rodezio-agent`).
- **LANGSMITH_WORKSPACE** (opcional): nome do workspace no LangSmith (padrão `default`).
- **LANGSMITH_WORKSPACE_ID** (opcional): ID do workspace (mais preciso que o nome, se disponível).
- **LANGSMITH_TRACING** (opcional): `true` para ativar tracing (ativo por padrão se a API key estiver definida).

## Rodar o agente

```bash
# Com .env carregado (recomendado)
pnpm agent:dev
pnpm agent:dev "Sua pergunta aqui"

# Ou após build
pnpm agent:build
pnpm agent:start
pnpm agent:start "Sua pergunta aqui"
```

## Testar no LangSmith Studio

1. Crie uma API key em [smith.langchain.com](https://smith.langchain.com) e defina `LANGSMITH_API_KEY` e `LANGSMITH_PROJECT` no `.env`.
2. Rode o agente (`pnpm agent:dev` ou chame `POST /agent` na API).
3. O navegador abrirá automaticamente na página do projeto no LangSmith quando você rodar `pnpm agent:dev`.
4. Se a URL não abrir corretamente, verifique o nome do workspace no LangSmith e ajuste `LANGSMITH_WORKSPACE` ou `LANGSMITH_WORKSPACE_ID` no `.env`.
5. Os traces de cada execução aparecerão no projeto configurado.

## Uso na API

O servidor expõe `POST /agent` com body `{ "message": "texto" }` e retorna `{ "messages": ["msg1", "msg2", ...] }` — array de mensagens para enviar separadamente.

Exemplos de mensagens:
- "Olá, como você pode me ajudar?" → resposta direta (sem pesquisa)
- "Fretes de São Paulo para Curitiba de grãos" → pesquisa no ES e retorna 2–15 fretes
