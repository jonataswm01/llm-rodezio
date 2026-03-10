# Escopo do Rodezio

Documento de referência sobre o que o Rodezio faz e não faz. Usado para onboarding e para instruções do agente.

---

## O que fazemos

| Funcionalidade | Descrição |
|----------------|-----------|
| Pesquisar fretes | Mostrar fretes já cadastrados no sistema (origem, destino, preço, transportador, etc.) |
| Facilitar contratação | Quando o usuário confirma um frete, fazemos a ponte com o embarcador. O contato **não** é liberado ao usuário |
| Cotação de frete | Quando o usuário pede cotação, chamamos o webhook n8n `frete-cotacao` e direcionamos para entrar em contato com o Jonatas no (16) 99733-0113 |
| Dúvidas sobre a estrada | Pedágio, leis de trânsito e assuntos relacionados à estrada |

---

## O que não fazemos

| Funcionalidade | Motivo |
|----------------|--------|
| Liberar contato do embarcador | Se o usuário pedir, dizer que não temos ou que não é liberado |
| Assuntos genéricos | Tudo que não for ligado a fretes ou dúvidas sobre a estrada |

---

## Cotação de frete

Quando o usuário pede cotação: o agente chama a tool `cotacao_frete`, que envia para o webhook n8n `frete-cotacao`:
- resumo da conversa
- número da pessoa (threadId)
- hora
- dados da cotação (origem, destino, tipo de carga) — **se tiver na conversa; se não tiver, não perguntar**

Depois o agente direciona a pessoa a entrar em contato com o Jonatas no (16) 99733-0113 para falar sobre o assunto. Esse contato é **exclusivo para cotação** — nunca informar em outras situações.

---

## Demandas fora do escopo (exemplos)

- "Me passa o telefone/WhatsApp do embarcador"
- Assuntos não relacionados a fretes ou à estrada

---

## Como o agente deve responder

Quando a demanda for fora do escopo:

1. **NUNCA** inventar funcionalidades ou prometer o que não fazemos
2. Ser direto e honesto
3. Redirecionar para o que podemos fazer

---

## Referências

- [JORNADA_CLIENTE.md](./JORNADA_CLIENTE.md) — Jornada do cliente e escopo (seção resumida)
- [ARQUITETURA.md](./ARQUITETURA.md) — Visão geral do projeto
