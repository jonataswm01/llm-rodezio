# Resumo dos Testes Intensivos do Agente Rodezio

**Data:** 13/03/2026 (atualizado após melhorias)  
**Cenários:** 21  
**Resultado:** 21/21 passaram (100%)

---

## Como a IA Reagiu por Funcionalidade

### 1. Pesquisa de Fretes (5/5 ✅)

| Cenário | Entrada | Reação da IA |
|---------|---------|--------------|
| **Origem + destino** | "fretes de São Paulo para Curitiba" | Chamou `pesquisar_fretes`, listou fretes com rota, valor, transportadora, data. |
| **Só destino** | "o que tem pra Santos?" | Chamou `pesquisar_fretes_flexivel` (modo destino). Contextualizou: "Dá uma olhada nesses fretes indo pra Santos e região" ou similar. Listou fretes. |
| **Só origem** | "fretes saindo de Maringá" | Chamou `pesquisar_fretes_flexivel` (modo origem). Listou fretes saindo da região. |
| **Sigla/região** | "tem frete de MT pra Baixada?" | Expandiu MT e Baixada para cidades, buscou e listou fretes. |
| **Lista vazia** | "fretes de Xyz123 para Abc456" | Mensagem adequada quando não há fretes (ex: "não achei", "não encontrei"). |

**Conclusão:** Pesquisa funciona bem. Escolha correta entre `pesquisar_fretes` e `pesquisar_fretes_flexivel`. Contextualização na intro quando é pesquisa flexível.

---

### 2. Cotação (3/3 ✅)

| Cenário | Entrada | Reação da IA |
|---------|---------|--------------|
| **Cotar com rota** | "quero cotar frete de Campinas pra Curitiba" | Chamou `cotacao_frete`, direcionou para Jonatas (16) 99733-0113. |
| **Orçamento** | "preciso de orçamento de frete" | Direcionou para Jonatas. OK. |
| **Cotação sem rota** | "quero uma cotação" | Direcionou para Jonatas sem pedir origem/destino. Resposta curta e direta. |

**Conclusão:** Cotação reconhecida em todas as variações. Direciona para Jonatas sem passos extras.

---

### 3. Conexão com Embarcador (9/9 ✅)

| Cenário | Entrada | Reação da IA |
|---------|---------|--------------|
| **Quero ver detalhes** | "fretes para Santos" → "me fala mais sobre o primeiro" | Mostrou dados do frete. **Não** pediu conexão nem chamou `conectar_embarcador`. |
| **Quero esse** | "fretes para Santos" → "quero o primeiro" | Mostrou dados, perguntou "Posso te colocar em contato com o embarcador?" — pergunta em aberto. |
| **Confirmação** | "fretes para Santos" → "quero o segundo" → "sim, pode ser" | Chamou `conectar_embarcador`, retornou mensagem da tool. |
| **Me passa contato** | "fretes de Rio Verde para Santos" → "me passa o WhatsApp do embarcador do primeiro" | Chamou `conectar_embarcador` **imediatamente**, sem confirmação. |
| **Pedágio incluso** | "fretes de SP para Curitiba" → "o pedágio tá incluso no valor?" | Respondeu: "Infelizmente não tenho essa informação. Quer que eu te coloque em contato com o embarcador?" — **não inventou**. |
| **Contato sem frete** | "me passa o contato do embarcador" (sem ter visto fretes) | Sugeriu pesquisar fretes primeiro (rota/destino) ou pediu indicar qual frete. **Não** chamou tool. |
| **Referência** | "fretes de SP para Curitiba" → "quero o de Paranaguá pra São Francisco" | Interpretou referência, identificou frete na lista, mostrou dados ou conectou. |
| **Negativa na conexão** | "fretes para Santos" → "quero o primeiro" → "não, deixa" | Não chamou `conectar_embarcador`. Respeitou desistência do usuário. |
| **Múltiplas referências** | "fretes de SP para Curitiba" → "quero o terceiro" | Interpretou índice correto, mostrou dados do 3º frete e perguntou se pode conectar. |

**Conclusão:** Fluxo de conexão alinhado ao doc CONEXAO_EMBARCADOR. Sem "fechar", sem "Confirma?", pedido de contato chama tool imediatamente. Contato sem frete sugere pesquisa primeiro.

---

### 4. Fora do Escopo (4/4 ✅)

| Cenário | Entrada | Reação da IA |
|---------|---------|--------------|
| **Assunto fora** | "qual a previsão do tempo amanhã?" | Redirecionou para fretes/estrada. Não inventou funcionalidade. |
| **Cumprimento** | "Oi, tudo bem?" | Respondeu direto, sem ferramentas. Tom humano. |
| **Pergunta fora após contexto** | "fretes para Santos" → "qual a capital do Brasil?" | Redirecionou para o que fazemos, mesmo com histórico de fretes. |
| **Dúvida sobre estrada** | "qual a lei do pedágio para caminhão?" | Respondeu sobre pedágio/frete/estrada sem chamar tools. |

**Conclusão:** Redireciona corretamente. Mantém foco em fretes e estrada.

---

## Resumo por Área

| Área | Passou | Total |
|------|--------|-------|
| Pesquisa | 5 | 5 |
| Cotação | 3 | 3 |
| Conexão/Embarcador | 9 | 9 |
| Fora do escopo | 4 | 4 |

---

## Melhorias Implementadas (validadas pelos testes)

1. **Contato sem frete:** Prompt reforçado para sugerir pesquisar fretes primeiro. IA não chama `conectar_embarcador` sem frete na conversa.
2. **Cotação sem rota:** Direciona para Jonatas sem pedir origem/destino.
3. **Negativa na conexão:** Usuário desiste ("não, deixa") → IA não chama tool.
4. **Lista vazia:** Mensagem adequada quando não há fretes.
5. **Pergunta fora após contexto:** Redireciona mesmo com histórico de fretes.
6. **Dúvida sobre estrada:** Responde sem chamar tools.
7. **Assertions flexíveis:** `containsAny` aceita variações de linguagem (ex: "indo pra Santos" em vez de "destino").

---

## Como Rodar os Testes

```bash
# Testes críticos (CONEXAO_EMBARCADOR) — 4 cenários
pnpm test:agent

# Testes intensivos (todas as funcionalidades) — 21 cenários
pnpm test:agent:completo

# Com opções
pnpm test:agent:completo --verbose      # Resposta completa em falhas
pnpm test:agent:completo --area=pesquisa # Só cenários de pesquisa
```
