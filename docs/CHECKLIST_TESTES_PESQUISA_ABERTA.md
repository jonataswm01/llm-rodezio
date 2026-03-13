# Checklist de Testes — Pesquisa de Frete sem Rota (`pesquisar_fretes_aberto`)

Lista de cenários para testar manualmente a nova funcionalidade. Use a mesma conversa (thread) para cenários que dependem de histórico.

---

## Pré-requisitos

- [ ] Agente rodando (`pnpm agent:dev` ou integrado ao WhatsApp)
- [ ] Elasticsearch com fretes cadastrados
- [ ] Redis conectado

---

## 1. Busca aberta (sem histórico)

**Objetivo:** Verificar que "tem frete?" sem contexto retorna 8 fretes mais recentes.

| # | Você digita | O que verificar |
|---|-------------|-----------------|
| 1.1 | `tem frete?` | Retorna lista de fretes (até 8). Intro genérica tipo "Olha, achei esses fretes. Vê se algum te interessa." |
| 1.2 | `o que tem?` | Mesmo comportamento — lista de fretes |
| 1.3 | `me mostra uns fretes` | Mesmo comportamento |
| 1.4 | `quero ver fretes` | Mesmo comportamento |
| 1.5 | `tem frete?` | **Não** deve perguntar "qual origem?" ou "qual destino?" |

---

## 2. Busca com cache — rota completa (origem + destino)

**Objetivo:** Após pesquisar uma rota, "tem frete?" deve usar essa rota silenciosamente.

| # | Você digita | O que verificar |
|---|-------------|-----------------|
| 2.1 | `fretes de Maringá para Paranaguá` | Mostra fretes da rota (até 15) |
| 2.2 | `tem frete?` | Mostra fretes da **mesma rota** (Maringá→Paranaguá). Intro **genérica** — não deve dizer "busquei de Maringá pra Paranaguá" |
| 2.3 | `o que tem?` | Mesmo comportamento — usa cache, intro genérica |

---

## 3. Busca com cache — só origem

**Objetivo:** Última pesquisa foi só origem; "tem frete?" usa `pesquisar_fretes_flexivel` modo origem.

| # | Você digita | O que verificar |
|---|-------------|-----------------|
| 3.1 | `fretes saindo de Maringá` | Mostra fretes com origem em Maringá |
| 3.2 | `tem frete?` | Mostra fretes **saindo de Maringá**. Intro genérica |

---

## 4. Busca com cache — só destino

**Objetivo:** Última pesquisa foi só destino; "tem frete?" usa `pesquisar_fretes_flexivel` modo destino.

| # | Você digita | O que verificar |
|---|-------------|-----------------|
| 4.1 | `o que tem pra Santos?` | Mostra fretes com destino em Santos |
| 4.2 | `tem frete?` | Mostra fretes **para Santos**. Intro genérica |

---

## 5. Prioridade — última pesquisa sempre

**Objetivo:** Se houver múltiplas pesquisas, usa a **última**.

| # | Você digita | O que verificar |
|---|-------------|-----------------|
| 5.1 | `fretes de Maringá para Paranaguá` | Mostra fretes Maringá→Paranaguá |
| 5.2 | `fretes de São Paulo para Curitiba` | Mostra fretes SP→Curitiba (cache atualizado) |
| 5.3 | `tem frete?` | Mostra fretes **SP→Curitiba** (não Maringá→Paranaguá) |

---

## 6. Fluxo conectar embarcador após `pesquisar_fretes_aberto`

**Objetivo:** Garantir que "quero esse" funciona após buscar com `pesquisar_fretes_aberto`.

| # | Você digita | O que verificar |
|---|-------------|-----------------|
| 6.1 | `tem frete?` | Mostra lista de fretes |
| 6.2 | `quero o primeiro` | Deve perguntar "Posso te colocar em contato com o embarcador?" |
| 6.3 | `sim, pode` | Deve chamar conectar_embarcador e retornar mensagem de sucesso |

---

## 7. Intro genérica — nunca revelar rota

**Objetivo:** A IA nunca deve dizer que usou a rota do histórico.

| # | Você digita | O que **NÃO** deve aparecer na resposta |
|---|-------------|----------------------------------------|
| 7.1 | `fretes de Rio Verde para Santos` | — |
| 7.2 | `tem frete?` | "busquei de Rio Verde", "que você tava vendo", "da rota anterior" |

---

## 8. Quantidade de fretes

| Situação | Esperado |
|----------|----------|
| Sem cache (busca aberta) | 8 fretes |
| Com cache (rota completa ou parcial) | 15 fretes |

---

## 9. Testes automatizados

```bash
# Filtra só cenários de pesquisa (inclui os novos)
pnpm test:agent:completo --area=pesquisa

# Todos os cenários
pnpm test:agent:completo
```

---

## Resumo rápido

| Cenário | O que testar |
|---------|--------------|
| 1 | "tem frete?" sem histórico → 8 fretes, intro genérica |
| 2 | Pesquisa rota → "tem frete?" → usa cache, intro genérica |
| 3 | Pesquisa só origem → "tem frete?" → usa origem do cache |
| 4 | Pesquisa só destino → "tem frete?" → usa destino do cache |
| 5 | Múltiplas pesquisas → "tem frete?" → usa a **última** |
| 6 | "tem frete?" → "quero o primeiro" → conectar embarcador funciona |
| 7 | Nunca revelar "busquei de X pra Y" |
