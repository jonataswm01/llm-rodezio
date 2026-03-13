# Conexão com o embarcador

## Contexto

O Rodezio **não fecha fretes**. Apenas faz a ponte/conexão do caminhoneiro com o embarcador. Precisamos ser verdadeiros — nada de promessas falsas.

## Problema atual

O prompt usa frases como "quer fechar esse frete?" ou "confirma pra eu fechar" — mas não temos esse poder. O fechamento é entre caminhoneiro e embarcador.

## Direção acordada

O tom deve ser suave. O caminhoneiro já passou tempo olhando e escolhendo frete — nesse momento, um tom leve e acolhedor funciona melhor do que algo que soe como cobrança ou formalidade. Evitar "Confirma?" ou "Confirma isso?" porque transmite peso, exige uma resposta fechada e pode soar como se estivéssemos pressionando. Preferir perguntas em aberto que convidam o sim sem exigir: "Posso te conectar com o embarcador?", "Posso te colocar em contato com o embarcador?". A ideia é oferecer, não cobrar.

Na linguagem, "conectar" e "conexão" podem soar técnicos ou distantes para quem está na estrada. Suavizar com expressões mais do dia a dia. O caminhoneiro precisa entender na hora, sem esforço.

O prompt não deve usar "fechar" em nenhum ponto. Fechar frete é o que acontece entre caminhoneiro e embarcador — nós não fazemos isso. Usar "fechar" seria promessa falsa. O que fazemos é a ponte: colocamos os dois em contato. No fluxo, na mesma mensagem mostramos os dados do frete e perguntamos se quer ser conectado. Assim ele vê tudo de uma vez; se algo estiver errado, percebe e fala antes de seguir.

---

## Sinônimos para "conectar" (uso no prompt)

Pesquisa de sinônimos no contexto de estabelecer comunicação / colocar em contato:

- **Colocar em contato** — direto, claro
- **Fazer a ponte** — informal, imagem concreta
- **Intermediar** — mais formal, mas preciso
- **Ligar** (ligar os dois) — coloquial
- **Te coloco em contato** — pessoal, próximo
- **Fazer a ligação** — simples

Recomendação: priorizar "colocar em contato", "fazer a ponte", "te coloco em contato" — soam mais naturais para o caminhoneiro.

---

## Quando o usuário pede contato direto

Em vez de responder que não podemos ou não consigo passar o contato: **apenas diga que vai entrar em contato com o embarcador e que logo ele entrará em contato com o caminhoneiro**. Em paralelo, chamar a tool `conectar_embarcador` com o último frete que foi de interesse na conversa. A existência da ferramenta e o fato de acionarmos o endpoint **jamais** devem ser mencionados ao usuário — ele só precisa saber que o embarcador vai entrar em contato.

Exemplos de frases: "Vou falar com o embarcador agora, logo ele entra em contato com você.", "Beleza, aciono o responsável por esse frete e ele te procura em breve."

---

## Frase de fechamento da lista

"Qualquer um te interessa, me fala!" está dentro do que fazemos — se interessa, podemos fazer a conexão. Alternativas curtas que passam a mesma intenção:

- "Algum te interessa? Me fala!"
- "Qualquer um que te sirva, me avisa!"
- "Se algum te chamar atenção, manda!"

*Nota: "Se algum te chamar atenção, manda!" — mais dinâmico, convida à ação.*

---

## Tool: `conectar_embarcador`

A ferramenta foi renomeada de `contratar_frete` para `conectar_embarcador` para alinhar com a linguagem e o que realmente fazemos.

---

## Momento de mostrar o frete (a "confirmação")

**Dados:** Mostrar todos os campos, mesmo os que vieram como "não informado". Exibir a estrutura completa.

**Prioridade:** A data sempre em destaque — é o campo de maior prioridade.

**Ordem:** A IA organiza os demais como fizer mais sentido.

**Transição:** Sim, deve ter frase de transição antes dos dados ("Beleza, esse aqui...", "O frete é esse:"), como já tem hoje.

**Transição + pergunta:** Se a mensagem for pequena, transição e pergunta "Posso te colocar em contato?" na mesma mensagem. Se for grande, separar.

**Pesquisa flexível:** Não há menos ou mais dados — a busca retorna fretes como as outras. A IA só contextualiza: "Esses são os fretes pro destino X" ou "Esses são os fretes da região de Y...".

---

## IA inventando coisas

**Onde acontece:** Na hora da "confirmação" ou quando o usuário pede mais informação daquele frete.

**Regra central:** Quando a IA não tiver a informação para responder, **não deve supor nem inventar**. Deve tentar conectar o usuário com o embarcador — ele é o dono do frete e sabe responder todas as perguntas. A IA não vai saber o que será dito na conversa embarcador–usuário; basta saber que o embarcador tem a resposta.

**Exemplo:** Usuário perguntou se o preço dos pedágios já está incluso no valor do frete. A IA respondeu que sim — informação inventada. Não queremos isso.

**Flexibilidade:** Deduções razoáveis do contexto estão ok (ex: frete de grãos provavelmente usa graneleiro). Suposições sobre dados específicos do frete não (ex: pedágio incluso no valor). A flexibilidade existe, mas é pouca.

**Tom da negativa:** Evitar "Isso aí não tá no sistema" — soa robótico. Preferir: "Infelizmente não tenho essa informação. Quer que eu te coloque em contato com o embarcador pra ele te falar?"
