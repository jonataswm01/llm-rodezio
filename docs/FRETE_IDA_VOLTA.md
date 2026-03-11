# Frete Ida + Volta (Frete Casado)

Documento de refinamento da ideia de oferecer frete de ida e retorno para caminhoneiros.

> Status: em refinamento (nao implementar ainda)

---

## 1) Contexto

A dor central do caminhoneiro e rodar vazio no retorno. Mesmo quando a ida paga bem, o lucro final da viagem cai quando nao existe carga de volta.

A proposta do **Frete Ida + Volta** e tratar a viagem como um ciclo unico:

- Ida: origem A -> destino B
- Volta: destino B -> origem A (ou regiao de A)

Em vez de vender apenas um frete, o produto passa a oferecer **resultado da rota completa**.

---

## 2) Objetivo do produto

Criar uma experiencia que aumente previsibilidade e ganho total do caminhoneiro, reduzindo km rodado vazio no retorno.

Objetivos praticos:

- Aumentar taxa de aceite de fretes de ida
- Aumentar receita por ciclo (ida + volta)
- Reduzir tempo de busca por frete de retorno
- Melhorar retencao de caminhoneiros na plataforma

---

## 3) Proposta de valor (mensagem para o caminhoneiro)

"Aqui voce nao pega so a ida. A gente te ajuda a voltar carregado."

Pilares da proposta:

- **Lucro no ciclo completo**, nao apenas no frete isolado
- **Menos incerteza** na volta
- **Mais previsibilidade** de agenda e caixa

---

## 4) Niveis de retorno (para evitar promessas erradas)

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

## 5) Escopo inicial (MVP de produto)

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

## 6) Regras de negocio sugeridas

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

## 7) Experiencia recomendada (visao de tela)

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

## 8) Metricas para validar a ideia

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

## 9) Principais riscos e mitigacoes

- **Risco:** promessa exagerada de retorno  
  **Mitigacao:** usar niveis de confianca e linguagem transparente.

- **Risco:** retorno ruim economicamente  
  **Mitigacao:** aplicar piso minimo de ganho no ciclo completo.

- **Risco:** janelas inviaveis (espera longa)  
  **Mitigacao:** filtro de folga minima e aviso de risco operacional.

- **Risco:** complexidade excessiva no lancamento  
  **Mitigacao:** iniciar com MVP (ida + 1 melhor opcao de volta + 2 alternativas).

---

## 10) Plano de refinamento (antes de producao)

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

## 11) Criterios para Go/No-Go de producao

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

## 12) Perguntas em aberto para proximos refinamentos

- Qual raio de retorno aceitavel por perfil de caminhoneiro?
- Qual tempo maximo de espera entre descarga e nova coleta?
- O que pesa mais na escolha: valor total, prazo de pagamento ou km vazio?
- Em quais rotas iniciar o piloto (ex.: Maringa <-> Santos e similares)?

---

## 13) Decisao atual

A ideia e promissora e alinhada com a dor real do caminhoneiro.  
Neste momento, seguimos em refinamento de regras, comunicacao e metricas, sem entrar em implementacao tecnica.
