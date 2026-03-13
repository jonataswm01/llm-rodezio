# Sugestões de Melhorias — Baseadas nos Testes do Agente

Análise dos testes intensivos (15 cenários, 13 passaram) e recomendações priorizadas.

---

## 1. Melhorias no Prompt (prioridade alta)

### 1.1 Contato sem frete na conversa

**Problema:** Quando o usuário pede contato sem ter visto fretes, a IA responde "Me diz qual frete você quer falar" — correto, mas pouco orientador. O caminhoneiro pode não saber que precisa pesquisar primeiro.

**Sugestão:** Reforçar na seção CONTATO DO EMBARCADOR (linha 46):

```
- Se não houver frete de interesse claro na conversa, sugira pesquisar primeiro: "Pesquisa uns fretes, me fala a rota ou o destino (ex: fretes pra Santos, fretes de Maringá). Aí a gente vê qual te interessa e eu faço a ponte com o embarcador."
- Alternativa: "Me diz qual frete você quer" — mas prefira sugerir a pesquisa quando a conversa estiver vazia de fretes.
```

**Impacto:** Reduz confusão e acelera o fluxo para conexão.

---

### 1.2 Cotação — manter concisão

**Situação:** A IA já responde bem ("Pra cotar... fala direto com o Jonatas no (16) 99733-0113"). O prompt pede "apenas direcionamento" e "não adicione passos extras" — está OK.

**Sugestão:** Reforçar que a resposta deve ser curta e direta, sem repetir o número em múltiplos formatos. O teste já passou após ajuste; nenhuma alteração obrigatória no prompt.

---

## 2. Melhorias nos Testes (prioridade média)

### 2.1 Cenários não cobertos

| Cenário | Sugestão | Motivo |
|---------|----------|--------|
| **Lista vazia** | "fretes de cidade inexistente X para Y" | Validar mensagem quando não há fretes |
| **Cotação sem rota** | "quero uma cotação" (sem origem/destino) | Confirmar que direciona para Jonatas sem pedir dados |
| **Negativa na conexão** | "fretes para Santos" → "quero o primeiro" → "não, deixa" | Garantir que não chama a tool |
| **Múltiplas referências** | "quero o terceiro" após lista de 15 | Garantir índice correto |
| **Pergunta fora após contexto** | "fretes para Santos" → "qual a capital do Brasil?" | Manter redirecionamento mesmo com histórico |
| **Dúvida sobre estrada** | "qual a lei do pedágio?" | Validar que responde sem tool (conhecimento geral) |

### 2.2 Assertions mais robustas

- **Tool chamada:** Os testes não verificam se a tool foi realmente chamada (apenas o conteúdo da resposta). Considerar log ou mock para validar chamadas de tool.
- **Ordem:** Garantir que "Quero ver detalhes" não chame `conectar_embarcador` — hoje o `notContains` cobre "confirma" mas não valida ausência de chamada à tool.
- **Sinônimos:** Para "contato", aceitar "ponte", "contato", "embarcador" como variações válidas.

### 2.3 Testes de regressão

- Adicionar ao CI: `pnpm test:agent` antes de merge.
- Manter `test:agent:completo` para validação manual ou nightly.

---

## 3. Melhorias no Prompt (prioridade baixa)

### 3.1 Consistência da resposta "contato sem frete"

A tool `conectar_embarcador` retorna `CACHE_EMPTY_MESSAGE` quando não há fretes no cache. O prompt pode orientar a IA a não chamar a tool quando não houver frete na conversa — assim a resposta fica mais controlada.

**Sugestão:** Na seção de intenções, adicionar:

```
- "Me passa o contato" SEM frete na conversa = NÃO chame conectar_embarcador. Peça para pesquisar fretes primeiro. Só chame a tool quando houver frete de interesse na conversa.
```

### 3.2 Dúvidas sobre estrada

O prompt diz que respondemos "dúvidas sobre a estrada (pedágio, leis de trânsito)". O teste "Pedágio incluso" cobre dúvida sobre o frete — não sobre estrada em geral.

**Sugestão:** Adicionar cenário de teste: "qual a lei do pedágio para caminhão?" — validar que a IA responde com conhecimento geral (ou redireciona se não tiver) sem chamar tools.

---

## 4. Melhorias na Estrutura dos Testes

### 4.1 Organização

- Separar em arquivos: `test-agent-pesquisa.ts`, `test-agent-conexao.ts`, `test-agent-cotacao.ts`, `test-agent-escopo.ts`.
- Ou: manter um único arquivo com tags/categorias para filtrar por área.

### 4.2 Logs e debug

- Opção `--verbose` para exibir respostas completas em falhas.
- Salvar respostas em arquivo para análise posterior (ex: `test-results/resposta-{cenario}.txt`).

### 4.3 Flakiness

- LLMs podem variar. Para cenários críticos, considerar:
  - Múltiplas execuções e votação.
  - Ou aceitar um conjunto de respostas válidas (ex: "cotação" OU "cotar" OU "preço").

---

## 5. Resumo de Prioridades

| Prioridade | Item | Esforço |
|------------|------|---------|
| Alta | Reforçar prompt "contato sem frete" | Baixo |
| Média | Adicionar cenários: lista vazia, negativa, cotação sem rota | Médio |
| Média | Integrar `test:agent` no CI | Baixo |
| Baixa | Separar testes por área | Médio |
| Baixa | Validar chamadas de tool (mock/log) | Alto |

---

## 6. Próximos Passos Sugeridos

1. Implementar a melhoria de prompt para "contato sem frete" (linha 46 do graph.ts).
2. Adicionar 2–3 cenários críticos no `test-agent-completo.ts` (lista vazia, negativa, cotação sem rota).
3. Adicionar script no `package.json` para CI: `"test:ci": "pnpm test:agent"`.
4. Rodar `pnpm test:agent:completo` periodicamente para validar regressões.
