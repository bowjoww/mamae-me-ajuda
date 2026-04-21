# Onboarding do Henrique — Playbook Humano

> Audiência: fundador/padrasto. Tom: humano, não técnico. Este é um guia de
> psicologia e UX — não manual de features.

O produto está pronto. A parte difícil agora é a primeira sessão dele. Abaixo,
como orientar sem estragar.

---

## 1. Antes de abrir o app — o que dizer

Três frases, na ordem:

1. **"Não é um tutor que te dá resposta. É um cara que te faz pensar."**
   Ele vai testar isso no minuto 1. Tratá-lo como ChatGPT-que-resolve-lição
   queima o respeito pelo app.

2. **"É tipo sandbox — você explora Expedições, tipo Minecraft pra estudo."**
   Ele joga Minecraft, Roblox, Don't Starve. A gamificação foi desenhada nessa
   linguagem (Aprendiz→Mestre, power-ups Tocha/Bússola, achievements "Primeira
   Faísca"). Use essa analogia, não "game de estudo".

3. **"Nota na prova é efeito colateral, não objetivo."**
   Tira pressão e aumenta engajamento. Quem estuda pra explorar aprende. Quem
   estuda porque a nota manda, fecha o app.

---

## 2. Fluxo da primeira sessão (15-20 min)

| Etapa | Tempo | O que ele faz |
|---|---|---|
| Consent Modal | 1 min | Aceita — explique que é "regra de lei, é rapidinho" |
| Welcome | 30s | Digita o nome |
| `/prova` (Modo Prova) | 5 min | **Cria expedição: "Matemática 23/04 plano cartesiano e simetrias"** |
| Foto do caderno | 2 min | Tira foto das fichas (IA calibra o simulado discursivo) |
| Trecho 1 — Abertura | 5-8 min | Conversa inicial, ganha primeiro XP |
| Encerramento natural | — | **Ele fecha quando quiser.** Não empurre mais. |

**Importante**: se ele terminar o trecho 1 e fechar o app, isso é **sucesso**.
Primeira sessão não precisa ser "completar tudo". Precisa ser "voltar amanhã".

---

## 3. Armadilhas — o que evitar

**Não sentar junto "vigiando".** Fica atrás dele e ele fecha em 3 min. Deixe
sozinho. Privacidade com o app é parte do que faz ele engajar.

**Não falar "viu, eu te disse que ia dar certo".** Cringe total. Se gostar,
volta sozinho. Se não gostar no dia 1, não force — tem ciclo de 2-3 dias pra engatar.

**Não prometer que é "melhor que ChatGPT".** Não é. É **diferente** (socrático,
não extrativo). Se ele reclamar "a IA não me dá resposta direta", explique **uma vez**:

> "Foi desenhada pra não entregar. Quer resposta direta, usa o ChatGPT mesmo.
> Esse app é pra você aprender de verdade pra prova."

E **para**. Se ele rejeitar, deixe rejeitar.

**Não reclame se ele pular 1 dia.** Cronograma tem 7 provas até 29/04. O que
importa é **abrir pelo menos uma vez antes de cada prova**.

---

## 4. Como saber se está funcionando

Três sinais, em ordem:

1. **Abre espontaneamente ≥ 1 vez sem você lembrar.** Único sinal que importa.
   Se acontecer na 1ª semana, o produto pegou.
2. **Completa ≥ 1 expedição antes da prova de matemática (23/04).** Mesmo que
   pequena — significa Modo Prova servindo.
3. **Depois da prova, diz "já tinha visto esse tipo de questão".** Golden
   signal: simulado discursivo calibrou certo.

**Não sinais**: horas totais, XP, achievements. Vaidade. Qualidade sobre métrica.

---

## 5. Se der problema

| Problema | Ação |
|---|---|
| Ele fala que "tá lento" / "trava" | Print da tela + `/api/health` → reporta no Sentry |
| IA responde algo estranho/errado | Screenshot + observação do input → issue no repo |
| Ele não consegue fazer login | Verificar email verificado no Supabase Auth dashboard |
| Ele reclama que "é chato" | **Perguntar o que especificamente** antes de mexer em qualquer coisa |

Pra problemas técnicos, o log completo fica em:
- **Sentry**: https://sentry.io → projeto `mamae-me-ajuda`
- **PostHog**: eventos do usuário em tempo real

Se for fim de semana e ele estiver travado no app pra prova de segunda:
ligar pro fundador, mesmo tarde. É piloto.
