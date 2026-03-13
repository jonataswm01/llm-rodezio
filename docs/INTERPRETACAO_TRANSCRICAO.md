# Interpretação de Mensagens Transcritas por IA

Documento para anotar contexto sobre mensagens que chegam transcritas por IA (speech-to-text) e a necessidade de interpretação semântica para corrigir erros de transcrição.

---

## 1. Contexto do problema

**Situação:** Parte das mensagens do usuário é transcrita por IA (ex.: áudio → texto) antes de chegar ao sistema. A transcrição automática tem **taxa de erro maior** que texto digitado.

**Consequência:** O texto recebido pode conter:
- Palavras homófonas erradas ("Viver" em vez de "Vê aí")
- Nomes próprios distorcidos ("Dilberaba" em vez de "Uberaba")
- Expressões coloquiais mal interpretadas
- Termos do domínio (logística, cidades, produtos) confundidos com palavras comuns

**Objetivo:** A IA precisa ter **nível de interpretação** que permita inferir a intenção real do usuário mesmo quando a transcrição está incorreta.

---

## 2. Exemplo real

### Texto recebido (transcrição com erro)
> "Viver pra mim é Dilberaba. Dilberaba é gesso e adubo pra região de Mato Grosso, que é Rondonópolis, e região de Rio Verde, Goiás"

### O que o usuário provavelmente disse
> "**Vê aí pra mim di Uberaba.** Uberaba é gesso e adubo pra região de Mato Grosso, que é Rondonópolis, e região de Rio Verde, Goiás"

### Análise da interpretação

| Transcrição (errada) | Interpretação correta | Tipo de erro |
|---------------------|----------------------|--------------|
| "Viver pra mim é" | "Vê aí pra mim di" | Homofonia: "viver" ≈ "vê aí"; "é" ≈ "di" (de) |
| "Dilberaba" | "Uberaba" | Nome próprio: Uberaba é cidade em MG; transcrição inventou "Dilberaba" |
| "Dilberaba" (2ª vez) | "Uberaba" | Mesmo erro repetido |

**Contexto de domínio:**
- **Uberaba (MG):** cidade conhecida por produção/distribuição de gesso e adubo
- **Rondonópolis (MT):** região de Mato Grosso
- **Rio Verde (GO):** região de Goiás
- O usuário está pedindo para **verificar/buscar** algo relacionado a Uberaba (gesso e adubo) para essas regiões

**Intenção provável:** "Olha aí pra mim de Uberaba" — pedido para pesquisar fretes ou ofertas de gesso/adubo saindo de Uberaba para Mato Grosso e Goiás.

---

## 3. Nível de interpretação esperado

A IA deve ser capaz de:

1. **Reconhecer homofonia:** "viver" → "vê aí", "é" → "de/di", etc.
2. **Corrigir nomes próprios:** cidades, produtos, empresas — usando contexto de domínio (logística, regiões brasileiras).
3. **Inferir intenção:** mesmo com texto truncado ou errado, entender o pedido (pesquisar, verificar, conectar, etc.).
4. **Usar contexto da conversa:** histórico, domínio (fretes, gesso, adubo), regiões mencionadas.

---

## 4. Padrões comuns de erro em transcrição

| Padrão | Exemplo | Correção provável |
|--------|---------|-------------------|
| Homofonia | "viver" | "vê aí" |
| Nome de cidade distorcido | "Dilberaba" | "Uberaba" |
| Preposição/artigo | "é" sozinho | "de", "di" |
| Pronúncia regional | variações | normalizar para termo padrão |
| Termo técnico | "gesso" → "jeito"? | manter domínio (gesso, adubo) |

---

## 5. Notas e anotações

_(espaço para novos exemplos e padrões descobertos)_

- **2025-03-13:** Primeiro exemplo documentado: "Viver pra mim é Dilberaba" → "Vê aí pra mim di Uberaba"
- Cidades do domínio que podem ser mal transcritas: Uberaba, Rondonópolis, Rio Verde, Paranaguá, Maringá, etc.
- Produtos: gesso, adubo, soja, milho — manter vocabulário do domínio no prompt/system da IA

---

## 6. Implementação no projeto

As melhorias deste contexto foram aplicadas em camadas para reduzir falhas de interpretação:

1. **Prompt do agente**
   - Arquivo: `src/agents/langgraph/graph.ts`
   - Adicionada seção "INTERPRETAÇÃO DE TRANSCRIÇÃO" no `SYSTEM_PROMPT` com regras de homofonia, correção semântica e exemplo prático com "Dilberaba" -> "Uberaba".

2. **Extração de parâmetros da pesquisa**
   - Arquivo: `src/agents/langgraph/tools/pesquisar-fretes.ts`
   - Prompt de `extractParamsFromQuery` passou a instruir correção de nomes de cidades mal transcritos no contexto de fretes.

3. **Fallback técnico para geolocalização**
   - Novo arquivo: `src/agents/langgraph/tools/shared/transcription-corrections.ts`
   - Função: `tryCorrectCityName(rawName)`
   - Mapeamento inicial explícito:
     - `dilberaba` -> `Uberaba`
     - `diuberaba` -> `Uberaba`
     - `deuberaba` -> `Uberaba`
   - Arquivo integrado: `src/agents/langgraph/tools/shared/resolve-location.ts`
   - Fluxo: quando `getCitiesByQuery` não encontra cidade, tenta correção conhecida e repete a busca antes de cair para fallback de estado/texto.

### Regra para evolução

- Novos casos reais de transcrição devem ser adicionados em `transcription-corrections.ts` com mapeamento explícito (evitar correção agressiva).
- Sempre registrar exemplos relevantes neste documento para manter histórico de decisões.
