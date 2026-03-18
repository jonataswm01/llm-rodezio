# Pesquisa Flexível — Origem ou Destino Parcial

Documento de refinamento da ideia de permitir busca de fretes com **apenas origem** ou **apenas destino**, sem o agente perguntar o que falta.

> Status: implementado

---

## Índice

- [1) Visão geral](#1-visão-geral)
- [2) Contexto e problema atual](#2-contexto-e-problema-atual)
- [3) Objetivo](#3-objetivo)
- [4) Comportamento desejado](#4-comportamento-desejado)
- [5) Cenários de uso](#5-cenários-de-uso)
- [6) Interpretação da mensagem do usuário](#6-interpretação-da-mensagem-do-usuário)
- [7) Casos ambíguos e como evitar confusão](#7-casos-ambíguos-e-como-evitar-confusão)
- [8) Opções de implementação](#8-opções-de-implementação)
- [9) Regras de negócio sugeridas](#9-regras-de-negócio-sugeridas)
- [10) Perguntas em aberto](#10-perguntas-em-aberto)
- [11) Decisão atual](#11-decisão-atual)

---

## 1) Visão geral

Hoje, quando o usuário pede fretes **só com destino** (ex: "tem frete para Santos?") ou **só com origem** (ex: "tem frete saindo de Maringá?"), o agente tende a perguntar o que falta ("qual a origem?" ou "qual o destino?").

A proposta é: **o agente entende o pedido e faz a busca com o que foi informado**, sem ficar perguntando. Se o usuário disse só destino, busca fretes com aquele destino. Se disse só origem, busca fretes com aquela origem.

Este documento existe para refinar a ideia antes de implementar — definir cenários, regras de interpretação e evitar confusões.

---

## 2) Contexto e problema atual

### Comportamento atual (hipótese)

| Mensagem do usuário        | Comportamento atual (indesejado) | Comportamento desejado      |
|---------------------------|----------------------------------|-----------------------------|
| "tem frete para Santos?"   | "Qual a origem?"                 | Busca fretes com destino Santos |
| "quero frete saindo de SP" | "Para onde?"                     | Busca fretes com origem SP  |
| "fretes de Maringá"        | "Qual o destino?"                 | Busca fretes com origem Maringá |

### Dor do usuário

O caminhoneiro está na correria. Ele quer **ver opções** — não quer responder perguntas. Se ele disse "para Santos", pode ser que:
- ele está em qualquer lugar e quer ver o que tem indo para Santos
- ele quer explorar antes de decidir a rota completa
- ele não sabe a origem exata ainda

Fazer perguntas interrompe o fluxo e frustra.

---

## 3) Objetivo

- **Busca por destino apenas**: usuário informa só destino → retorna fretes que têm aquele destino (origem livre).
- **Busca por origem apenas**: usuário informa só origem → retorna fretes que têm aquela origem (destino livre).
- **Sem perguntas**: o agente não pergunta "qual a origem?" ou "qual o destino?" quando um dos dois falta.
- **Interpretação clara**: a mensagem do usuário deve ser bem interpretada para não confundir origem com destino.

---

## 4) Comportamento desejado

### Princípio geral

> O agente usa o que o usuário informou. Se informou só um lado da rota, busca por esse lado. Não pergunta o que falta.

### Tabela de decisão

| Usuário informou     | Ação do agente                          |
|----------------------|------------------------------------------|
| Origem + Destino     | Busca rota completa (comportamento atual) |
| Só Destino           | Busca fretes com aquele destino          |
| Só Origem            | Busca fretes com aquela origem           |
| Nenhum dos dois      | Responde que precisa de pelo menos origem ou destino (ou busca ampla? — ver perguntas) |

---

## 5) Cenários de uso

### 5.1 Só destino

| Exemplo de mensagem                    | Interpretação              | Busca                         |
|---------------------------------------|----------------------------|-------------------------------|
| "tem frete para Santos?"              | destino = Santos           | Fretes com destino Santos     |
| "quero carga indo pra Curitiba"       | destino = Curitiba         | Fretes com destino Curitiba   |
| "o que tem pra Baixada?"              | destino = Baixada (Santos/Paranaguá) | Fretes com destino na região |
| "fretes com destino em MT"             | destino = MT               | Fretes com destino em MT      |

### 5.2 Só origem

| Exemplo de mensagem                    | Interpretação              | Busca                         |
|---------------------------------------|----------------------------|-------------------------------|
| "tem frete saindo de Maringá?"        | origem = Maringá           | Fretes com origem Maringá     |
| "o que tem de SP?"                    | origem = SP                 | Fretes com origem em SP       |
| "fretes de Rio Verde"                 | origem = Rio Verde         | Fretes com origem Rio Verde   |
| "quero pegar carga em Cuiabá"         | origem = Cuiabá            | Fretes com origem Cuiabá      |

### 5.3 Origem + Destino (já coberto)

| Exemplo de mensagem                    | Interpretação              | Busca                         |
|---------------------------------------|----------------------------|-------------------------------|
| "fretes de São Paulo para Curitiba"   | origem = SP, destino = Curitiba | Rota completa            |

---

## 6) Interpretação da mensagem do usuário

### Palavras-chave que indicam papel (origem vs destino)

| Papel    | Exemplos de expressões                                      |
|----------|-------------------------------------------------------------|
| Destino  | "para X", "indo pra X", "com destino em X", "até X", "em direção a X" |
| Origem   | "de X", "saindo de X", "saindo em X", "de X para", "pegando em X", "em X" (quando contexto indica coleta) |

### Casos que exigem contexto

- **"fretes em Santos"** — pode ser origem ou destino. Depende do contexto da conversa ou da frase completa.
- **"tem algo em Curitiba?"** — ambíguo. Sugestão: priorizar destino (mais comum quando usuário está explorando).
- **"fretes de grãos"** — "de" aqui é tipo de carga, não origem. Não confundir.

### Regra sugerida para ambiguidade

Quando a frase não deixa claro se é origem ou destino:
- Se há palavra explícita ("para", "saindo de", "destino", "origem") → usar essa pista.
- Se não há → considerar **destino** como padrão quando há apenas um lugar (ex: "tem frete em Santos?" = destino Santos), pois é comum o usuário saber para onde quer ir antes de saber de onde sai.

---

## 7) Casos ambíguos e como evitar confusão

### 7.1 "Fretes de X"

- "Fretes de grãos" → tipo de carga, não origem.
- "Fretes de São Paulo" → origem = São Paulo.
- "Fretes de Maringá para Santos" → origem = Maringá, destino = Santos.

A preposição "de" sozinha pode ser origem ou tipo. O LLM precisa considerar:
- Se "X" é cidade/estado/região → provável origem.
- Se "X" é tipo de produto (grãos, farelo) → productType, não origem.

### 7.2 "Tem frete em X?"

- "Tem frete em Santos?" — "em" é ambíguo (origem ou destino).
- Proposta: tratar como **destino** por padrão (usuário costuma saber para onde quer ir).

### 7.3 Estado/região sem cidade

- "Fretes para MT" → destino = MT (busca por estado).
- "Fretes saindo do PR" → origem = PR.
- Comportamento: igual ao atual — expandir para cidade representativa ou usar coordenadas do estado quando aplicável.

### 7.4 Nenhum lugar informado

- "Quero ver fretes" / "o que tem de frete?"
- Opções: (a) buscar fretes recentes em geral; (b) pedir pelo menos origem ou destino.
- A definir no refinamento.

---

## 8) Implementação — Nova tool ES para busca parcial

### Decisão

Criar uma **nova tool** específica para busca por origem OU destino. A tool `pesquisar_fretes` atual continua responsável pela rota completa (origem + destino).

### Fluxo da nova tool

1. **Interpretar** a mensagem do usuário → extrair `origin` OU `destination` (e opcionalmente `productType`, `carrierName`).
2. **Resolver lat/lon** da cidade/estado informado — mesma lógica da `pesquisar_fretes` (API SAG: `getCitiesByQuery`, `getStateCoordinates`, `resolveCityWithContext`).
3. **Montar a query** para o Elasticsearch — filtro apenas em `origin` OU apenas em `destination`.
4. **Retornar** 2–15 fretes, mesma estrutura de resposta (array `fretes`).

### Estratégia de montagem da query (queries pré-montadas)

Cada versão de busca (origem apenas / destino apenas) terá uma **query pré-montada** no código. O LLM **não monta a query** — ele só extrai os parâmetros da mensagem do usuário (origem ou destino, productType, carrierName). O código da tool preenche os campos variáveis nos templates e executa.

**Benefícios**: segurança (evita injeção ou queries malformadas), previsibilidade, manutenção centralizada e consistência na ordenação e filtros.

### Estrutura da query ES

A query é praticamente a mesma da `searchFretes` atual, mas com **apenas um** dos filtros geo/texto (origem ou destino). Ordenação e filtros opcionais (productType, carrierName) permanecem.

---

### Exemplo 1 — Busca por ORIGEM apenas

**Cenário**: usuário disse "tem frete saindo de Maringá?"  
**Coordenadas** (exemplo): Maringá-PR → lat -23.42, lon -51.94  
**Raio**: 150km (ELASTICSEARCH_GEO_RADIUS_ORIGEM_KM)

```json
{
  "size": 15,
  "sort": [
    { "timestamp": "desc" },
    { "price": "desc" }
  ],
  "query": {
    "bool": {
      "must": [
        {
          "geo_distance": {
            "distance": "150km",
            "origin.location": {
              "lat": -23.42,
              "lon": -51.94
            }
          }
        }
      ]
    }
  }
}
```

**Quando não houver lat/lon** (ex.: busca por texto/estado), usar `match` em `origin.content`:

```json
{
  "size": 15,
  "sort": [
    { "timestamp": "desc" },
    { "price": "desc" }
  ],
  "query": {
    "bool": {
      "must": [
        {
          "match": {
            "origin.content": "Maringá"
          }
        }
      ]
    }
  }
}
```

---

### Exemplo 2 — Busca por DESTINO apenas

**Cenário**: usuário disse "tem frete para Santos?"  
**Coordenadas** (exemplo): Santos-SP → lat -23.96, lon -46.33  
**Raio**: 50km (ELASTICSEARCH_GEO_RADIUS_DESTINO_KM)

```json
{
  "size": 15,
  "sort": [
    { "timestamp": "desc" },
    { "price": "desc" }
  ],
  "query": {
    "bool": {
      "must": [
        {
          "geo_distance": {
            "distance": "50km",
            "destination.location": {
              "lat": -23.96,
              "lon": -46.33
            }
          }
        }
      ]
    }
  }
}
```

**Quando não houver lat/lon**, usar `match` em `destination.content`:

```json
{
  "size": 15,
  "sort": [
    { "timestamp": "desc" },
    { "price": "desc" }
  ],
  "query": {
    "bool": {
      "must": [
        {
          "match": {
            "destination.content": "Santos"
          }
        }
      ]
    }
  }
}
```

---

### Exemplo 3 — Com filtros opcionais (productType, carrierName)

**Busca por destino Santos + grãos**:

```json
{
  "size": 15,
  "sort": [
    { "timestamp": "desc" },
    { "price": "desc" }
  ],
  "query": {
    "bool": {
      "must": [
        {
          "geo_distance": {
            "distance": "50km",
            "destination.location": { "lat": -23.96, "lon": -46.33 }
          }
        },
        {
          "wildcard": {
            "product_type": { "value": "*grãos*", "case_insensitive": true }
          }
        }
      ]
    }
  }
}
```

**Busca por origem Maringá + transportadora G10**:

```json
{
  "size": 15,
  "sort": [
    { "timestamp": "desc" },
    { "price": "desc" }
  ],
  "query": {
    "bool": {
      "must": [
        {
          "geo_distance": {
            "distance": "150km",
            "origin.location": { "lat": -23.42, "lon": -51.94 }
          }
        },
        {
          "prefix": {
            "carrier_name": { "value": "G10", "case_insensitive": true }
          }
        }
      ]
    }
  }
}
```

---

### Resumo da nova função ES

| Parâmetro        | Origem apenas | Destino apenas |
|-----------------|---------------|----------------|
| `origin.location`   | ✅ geo_distance | ❌ não usa     |
| `destination.location` | ❌ não usa  | ✅ geo_distance |
| `origin.content`     | ✅ match (fallback) | ❌ não usa |
| `destination.content` | ❌ não usa | ✅ match (fallback) |
| `product_type`       | ✅ opcional   | ✅ opcional    |
| `carrier_name`       | ✅ opcional   | ✅ opcional    |

---

## 9) Regras de negócio sugeridas

1. **Não perguntar** quando o usuário informou pelo menos origem OU destino.
2. **Interpretar bem** — usar palavras-chave ("para", "saindo de", "de X para Y") para definir origem/destino.
3. **Ambiguidade "em X"** — tratar como destino por padrão.
4. **"De" + tipo de carga** — não confundir com origem (ex: "fretes de grãos" = productType).
5. **Quantidade de resultados** — manter entre 2 e 15 fretes, como hoje.
6. **Fallback** — se busca parcial retornar pouco, considerar ampliar (ex: só destino Santos → incluir região próxima?) — a definir.

---

## 10) Perguntas em aberto

1. **"O que tem de frete?"** (sem origem nem destino) — buscar fretes recentes em geral ou pedir mais informação?
2. **Fallback geográfico** — em busca só por destino, ampliar raio ou incluir cidades próximas quando houver poucos resultados?
3. **Prioridade de tool** — se evoluir a existente, o prompt deve priorizar "não perguntar" sobre "sempre ter rota completa"?
4. **Mensagem de resposta** — ao retornar fretes parciais, o agente deve explicar? Ex: "Achei fretes com destino em Santos. Qualquer um te interessa?"
5. **Clarificação em cidades homônimas** — manter o fluxo atual (perguntar qual Santos) ou há regra diferente para busca parcial?

---

## 11) Decisão atual

A ideia está alinhada com a jornada do caminhoneiro (resultado rápido, sem rodeios).  
Neste momento, o documento serve para refinar cenários, interpretação e escolha de implementação (A, B ou C) antes de codar.

---

## Referências

- [ESCOPO.md](./ESCOPO.md) — O que o Rodezio faz
- [ARQUITETURA.md](./ARQUITETURA.md) — Fluxo do agente e tools
- [pesquisar-fretes.ts](../src/agents/langgraph/tools/pesquisar-fretes.ts) — Implementação atual
