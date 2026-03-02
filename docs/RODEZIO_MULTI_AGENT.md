# Rodezio Multi-Agente — Entendimento e Requisitos

Documento de entendimento do sistema multi-agente Rodezio. Será atualizado conforme as dúvidas forem esclarecidas.

---

## Visão Geral

O **Rodezio** passa a ser um agente **multi-agêntico** com dois agentes em hierarquia:

```
                    ┌─────────────────────────┐
                    │   Agente 1: Rodezio     │  (orquestrador)
                    │   - Recebe a pergunta    │
                    │   - Pensa e analisa      │
                    │   - Decide como responder│
                    └───────────┬─────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
         ┌──────────────────┐    ┌─────────────────────────┐
         │ Resposta direta   │    │ Chama Agente 2          │
         │ (sem pesquisa)    │    │ (pesquisa no ES)        │
         └──────────────────┘    └───────────┬─────────────┘
                                              │
                                              ▼
                                    ┌─────────────────────────┐
                                    │   Agente 2: Pesquisador  │
                                    │   - Especialista em ES   │
                                    │   - Executa buscas       │
                                    └─────────────────────────┘
```

---

## Agente 1: Rodezio (Orquestrador)

| Aspecto | Descrição |
|---------|-----------|
| **Papel** | Recebe a pergunta, pensa e decide a melhor forma de responder |
| **Comportamento** | "Pensa" sobre a resposta — raciocínio antes de agir |
| **Decisão** | Se a resposta **precisa** de dados do Elasticsearch → chama Agente 2 |
| **Caso contrário** | Responde diretamente (conhecimento do LLM) |

**Modo de raciocínio:** ReAct — loop pensar → agir (chamar ES ou responder) → observar → repetir se necessário.

---

## Agente 2: Pesquisador ES

| Aspecto | Descrição |
|---------|-----------|
| **Papel** | Especialista em pesquisar fretes no Elasticsearch |
| **Index** | `fretes` |
| **Domínio** | Fretes coletados de grupos de WhatsApp |
| **Entrada** | Query em **linguagem natural** (vinda do Agente 1) |
| **Saída** | Resultados da busca no ES |
| **Geolocalização** | Pode usar API `sag-backend.roduno.work` para obter lat/long de cidades/estados e montar queries geo_point no ES |

### Mapping do index `fretes`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `carrier_name` | keyword | Nome do transportador |
| `destination` | object | `content` (text), `location` (geo_point) |
| `origin` | object | `content` (text), `location` (geo_point) |
| `price` | float | Preço do frete |
| `product_type` | keyword | Tipo de produto |
| `vehicle_type` | keyword | Tipo de veículo |
| `weight_amount` | integer | Peso |
| `weight_unit` | keyword | Unidade de peso |
| `timestamp` | date | Data/hora |
| `message_id`, `remote_jid`, `remoteJid_embarcador` | keyword/text | Identificadores |

---

## Regra de negócio: quantidade e critério dos fretes

O Agente 1 deve retornar aos clientes:
- **Mínimo:** 2 fretes
- **Máximo:** 15 fretes
- **Critério de ordenação:** combinação de **mais recentes** (timestamp) + **maior preço** (price — fretes mais caros primeiro)

(Quando a resposta envolve pesquisa no ES.)

---

## Fluxo Esperado (hipótese)

1. Usuário envia pergunta → Agente 1
2. Agente 1 analisa e decide:
   - **Caminho A:** Responde diretamente (sem pesquisa) → END
   - **Caminho B:** Precisa de fretes do ES → invoca Agente 2
3. Se Caminho B: Agente 2 executa busca no ES e retorna ao Agente 1
4. Agente 1 seleciona os **melhores** fretes (entre 2 e 15) e monta a resposta final → END

---

## Stack Atual vs. Necessária

| Componente | Atual | Necessário |
|------------|-------|------------|
| LangGraph | Sim | Sim (grafo com subgrafo ou tool) |
| OpenAI | Sim | Sim |
| Elasticsearch | Não | Sim (cliente `@elastic/elasticsearch`) |

---

## API de localização (geolocalização)

Os fretes têm `origin` e `destination` com `geo_point` (lat/long). Para resolver lat/long de cidades/estados, usa-se o backend externo:

**Base URL:** `https://sag-backend.roduno.work`

| Endpoint | Descrição |
|----------|-----------|
| `GET /v1/location/states` | Estados brasileiros (com coordenadas). Params: `q` (busca por nome), `page` |
| `GET /v1/location/cities` | Cidades brasileiras (com coordenadas). Params: `stateId` (UUID do estado), `q` (busca por nome), `page` |

**Regra:** Enviar apenas parâmetros que o usuário solicitar explicitamente (não enviar null/vazios).

Fluxo típico para obter lat/long de uma cidade: `states?q=São` → pegar UUID; `cities?stateId=<uuid>&q=São Paulo` → pegar coordenadas.

---

## Resumo do entendimento

| Aspecto | Decisão |
|---------|---------|
| Domínio ES | Fretes de WhatsApp (index `fretes`) |
| Quantidade | Mín 2, máx 15 fretes |
| Ordenação | Mais recentes + maior preço |
| Pesquisa | Linguagem natural → Agente 2 interpreta |
| Geolocalização | API sag-backend (states, cities) para lat/long |
| Raciocínio | ReAct (pensar → agir → observar em loop) |

---

*Documento consolidado com base nas respostas do usuário.*
