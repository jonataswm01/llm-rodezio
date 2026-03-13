# Frete Ida + Volta (Frete Casado)

Documento de refinamento da ideia de oferecer frete de ida e retorno para caminhoneiros.

> Status: em refinamento (nao implementar ainda)

---

## Indice

- [1) Visao geral](#1-visao-geral)
- [2) Contexto](#2-contexto)
- [3) Objetivo do produto](#3-objetivo-do-produto)
- [4) Proposta de valor (mensagem para o caminhoneiro)](#4-proposta-de-valor-mensagem-para-o-caminhoneiro)
- [5) Niveis de retorno (para evitar promessas erradas)](#5-niveis-de-retorno-para-evitar-promessas-erradas)
- [6) Escopo inicial (MVP de produto)](#6-escopo-inicial-mvp-de-produto)
- [7) Regras de negocio sugeridas](#7-regras-de-negocio-sugeridas)
- [8) Experiencia recomendada (visao de tela)](#8-experiencia-recomendada-visao-de-tela)
- [9) Metricas para validar a ideia](#9-metricas-para-validar-a-ideia)
- [10) Principais riscos e mitigacoes](#10-principais-riscos-e-mitigacoes)
- [11) Plano de refinamento (antes de producao)](#11-plano-de-refinamento-antes-de-producao)
- [12) Criterios para Go/No-Go de producao](#12-criterios-para-gono-go-de-producao)
- [13) Perguntas em aberto para proximos refinamentos](#13-perguntas-em-aberto-para-proximos-refinamentos)
- [14) Decisao atual](#14-decisao-atual)

---

## 1) Visao geral

Este documento existe para transformar uma intuicao de produto em uma proposta clara, validavel e segura de evoluir.

Hoje, o problema nao e simplesmente "achar frete". O problema real do caminhoneiro e **fechar uma rota que faca sentido financeiramente do inicio ao fim**. Em muitos casos, a ida ate paga bem, mas o retorno vazio destroi parte relevante do ganho.

A ideia do **Frete Ida + Volta** nasce para atacar essa dor. Em vez de apresentar apenas um frete isolado, o produto passa a tentar montar um **ciclo de viagem**:

- sair com carga
- entregar no destino
- ter retorno confirmado ou com boa chance
- reduzir km vazio
- aumentar o ganho total da operacao

Este material ainda nao define implementacao tecnica. O foco aqui e:

- explicar com clareza o problema que queremos resolver
- organizar a proposta de valor
- definir regras de negocio iniciais
- listar riscos, metricas e criterios de validacao

---

## 2) Contexto

A principal dor do caminhoneiro nao esta so em conseguir uma carga. Ela esta em conseguir uma carga que realmente compense quando se olha a viagem inteira.

Exemplo pratico:

- Ida: Maringa -> Santos
- Volta ideal: Santos -> Maringa ou regiao

No modelo tradicional, a decisao costuma ser tomada olhando apenas para a ida. O problema e que, sem visibilidade de retorno, o caminhoneiro assume riscos como:

- voltar vazio
- aceitar uma volta ruim so para nao perder a viagem
- ficar horas ou dias procurando retorno
- reduzir o lucro total da rota

A proposta do **Frete Ida + Volta** muda esse raciocinio. Em vez de vender apenas um frete, o produto passa a oferecer **resultado da rota completa**, com transparencia sobre o nivel de confianca da volta.

Essa mudanca e importante porque aproxima a plataforma da logica real de decisao do caminhoneiro: ele nao pensa apenas no valor da ida, ele pensa no quanto vai sobrar no ciclo inteiro.

---

## 3) Objetivo do produto

Criar uma experiencia que aumente previsibilidade e ganho total do caminhoneiro, reduzindo km rodado vazio no retorno.

Objetivos praticos:

- Aumentar taxa de aceite de fretes de ida
- Aumentar receita por ciclo (ida + volta)
- Reduzir tempo de busca por frete de retorno
- Melhorar retencao de caminhoneiros na plataforma

---

## 4) Proposta de valor (mensagem para o caminhoneiro)

"Aqui voce nao pega so a ida. A gente te ajuda a voltar carregado."

Pilares da proposta:

- **Lucro no ciclo completo**, nao apenas no frete isolado
- **Menos incerteza** na volta
- **Mais previsibilidade** de agenda e caixa

---

## 5) Niveis de retorno (para evitar promessas erradas)

Para nao gerar frustracao, o retorno deve ser classificado de forma transparente:

1. **Volta confirmada**
   - Ja existe carga elegivel reservada/confirmada
2. **Volta de alta probabilidade**
   - Existe historico e oferta consistente na janela prevista
3. **Volta sugerida**
   - Nao ha confirmacao, mas ha oportunidades em raio/regiao proxima

Regra de comunicacao:

- Nunca usar "garantido" sem confirmacao real.
- Mostrar sempre o nivel de confianca de volta.

---

## 6) Escopo inicial (MVP de produto)

### Inclui

- Encontrar frete de ida pela rota desejada
- Sugerir opcoes de retorno compativeis com:
  - janela de horario
  - tipo de carga
  - capacidade do veiculo
  - raio de retorno configuravel (ex.: ate 120 km da origem desejada)
- Exibir valor estimado do ciclo (ida + volta)
- Exibir classificacao de confianca do retorno

### Nao inclui (neste momento)

- Garantia financeira de retorno
- Otimizacao multi-paradas complexa
- Leilao dinamico em tempo real

---

## 7) Regras de negocio sugeridas

1. **Compatibilidade de rota**
   - Retorno precisa terminar na origem ou em regiao aceitavel configurada.
2. **Compatibilidade de janela**
   - Horario de descarga da ida deve permitir coleta da volta com folga minima.
3. **Compatibilidade de operacao**
   - Tipo de carga, carroceria, peso e exigencias devem ser compativeis.
4. **Compatibilidade economica**
   - Ciclo completo precisa superar um piso minimo de ganho por km e/ou por dia.
5. **Transparencia de custos**
   - Exibir pedagio estimado, km vazio estimado e prazo de pagamento.

---

## 8) Experiencia recomendada (visao de tela)

Cartao "Frete Casado":

- Ida: Maringa -> Santos (R$ X)
- Volta: Santos -> Maringa/regiao (R$ Y)
- Total estimado do ciclo: R$ Z
- Km vazio estimado: N km
- Confianca da volta: Confirmada / Alta probabilidade / Sugerida

Call-to-action sugerido:

- "Quero esse ciclo"
- "Ver outras voltas para essa ida"

---

## 9) Metricas para validar a ideia

### Metricas de adesao

- % de caminhoneiros que clicam em oferta de ida + volta
- % de aceite quando existe retorno sugerido vs quando nao existe

### Metricas operacionais

- Km vazio medio por motorista
- Tempo medio para encontrar retorno
- Taxa de cancelamento por incompatibilidade de janela

### Metricas de resultado

- Receita media por ciclo
- Margem media por ciclo
- Retencao de caminhoneiros (7/30 dias)

---

## 10) Principais riscos e mitigacoes

- **Risco:** promessa exagerada de retorno  
  **Mitigacao:** usar niveis de confianca e linguagem transparente.

- **Risco:** retorno ruim economicamente  
  **Mitigacao:** aplicar piso minimo de ganho no ciclo completo.

- **Risco:** janelas inviaveis (espera longa)  
  **Mitigacao:** filtro de folga minima e aviso de risco operacional.

- **Risco:** complexidade excessiva no lancamento  
  **Mitigacao:** iniciar com MVP (ida + 1 melhor opcao de volta + 2 alternativas).

---

## 11) Plano de refinamento (antes de producao)

### Fase A - Tese e regras

- Fechar nomenclatura comercial ("Frete Casado" vs "Ida e Volta")
- Definir criterio de confianca do retorno
- Definir raio padrao de retorno por tipo de operacao

### Fase B - Validacao com usuarios

- Entrevistar caminhoneiros e testar linguagem comercial
- Validar se "total do ciclo" aumenta percepcao de valor
- Coletar objecoes (prazo, risco, custo, espera)

### Fase C - Piloto controlado

- Liberar para grupo pequeno de rotas com historico forte
- Medir impacto nas metricas-chave
- Ajustar regras de matching antes de escala

---

## 12) Criterios para Go/No-Go de producao

Go para producao quando:

- Conversao de aceite melhora vs modelo atual
- Km vazio medio cai de forma consistente
- Taxa de reclamacao por "volta frustrada" fica abaixo do limite definido
- Operacao consegue sustentar SLA de resposta para sugestoes de volta

No-Go (segurar lancamento) quando:

- Aumento de cancelamentos por falha de janela
- Percepcao de promessa enganosa
- Margem do ciclo nao melhora de forma material

---

## 13) Perguntas em aberto para proximos refinamentos

- Qual raio de retorno aceitavel por perfil de caminhoneiro?
- Qual tempo maximo de espera entre descarga e nova coleta?
- O que pesa mais na escolha: valor total, prazo de pagamento ou km vazio?
- Em quais rotas iniciar o piloto (ex.: Maringa <-> Santos e similares)?

---

## 14) Decisao atual

A ideia e promissora e alinhada com a dor real do caminhoneiro.  
Neste momento, seguimos em refinamento de regras, comunicacao e metricas, sem entrar em implementacao tecnica.
