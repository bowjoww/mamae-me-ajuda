# Retrospectiva v1 — Construção do Mamãe Me Ajuda

> Arquivo histórico da sprint de construção que entregou o produto pro Henrique
> (cronograma real: provas 23/04 → 29/04). Audiência: CEO/Board + referência
> pras próximas sprints.

---

## 1. O que deu certo

**Orquestração 3 tiers rodou.** Planning → Execução → Auditoria em paralelo
com gates de convergência. Swap de modelo + 2 features + refactor + hardening
em < 48h.

**Reality Checker como gate multi-passagens** segurou 2 entregas ruins antes do
merge. Agente mais valioso — não por perfeição, mas por parar a linha.

**Pedagogia sobreviveu ao swap.** Defesa socrática em 3 camadas independentes:
prompt byte-exato em `aiProvider.ts`, tabela XP que premia "responder com dica"
acima de "resposta direta", e adversarial eval com 10 vetores nomeados. Gemini
→ GPT-5.1 sem mudar comportamento didático. Arquitetura, não sorte.

**Pivô persona sem drama.** Board corrigiu "Henrique joga Minecraft, não CS"
(sandbox, não esports). UI Designer v2 refez em 1 rodada. 474/475 testes verdes
após reskin completo.

---

## 2. Aprendizados caros

**UI desconectada do backend na 1ª passagem.** Frontend renderizou mocks com
shape diferente do que backend devolvia. Integration agent amarrou depois.
**Lição**: agente "integration contract" publicando TS types compartilhados
**antes** de backend+frontend começarem. 30 min setup poupa 3h reconciliação.

**Polish-A parcialmente disparado.** 3 agentes publicados, 2 rodaram.
Descoberto em auditoria. **Lição**: checklist "disparado/concluído" explícito.
"Publicado" ≠ "feito".

**Reality Checker citou linhas stale.** Apontou tela branca em `fetchProfile`
throw, mas código já tinha `useAsyncResource` com fallback. Leu cache antigo.
**Lição**: `Read` obrigatório antes de citar linha. Virou regra.

---

## 3. Trade-offs conscientes

| Decisão | Por quê | Risco |
|---|---|---|
| Adversarial eval **não roda em CI** | Precisa key real + custa $ | Delegado à Board rodar 1x no deploy (seção 5 do deploy guide). Se não rodar, risco de regressão pedagógica silenciosa. |
| Seed de `achievements_catalog` **não verificado em prod** | Migration 003 tem o seed, mas ninguém rodou `select count(*)` em prod ainda | Checklist de deploy force a verificação (seção 2 do deploy guide). |
| HUD de gamificação **rico na primeira sessão** | XP bar + rank + achievements todos visíveis | Pode sobrecarregar Henrique. Mitigado por empty states dia-zero (rank oculto até 1º XP, inventário começa vazio). |

---

## 4. Métricas de sucesso pós-quinta (23/04)

**Primária**: Henrique tira > 70% na prova de matemática.
**Secundária**: Henrique usa o app ≥ 3 dias na semana de provas (21-29/04).
**Pedagógica**: % de acertos "com 2+ dicas socráticas" > 20% — prova que ele
  está engajando com o método, não só chutando.

Se primária passar mas pedagógica falhar: cuidado, ele pode estar contornando o
app (decorando). Revisar prompts.

Se pedagógica passar mas primária falhar: o app está ensinando mas o simulado
AV2 não calibrou. Revisar parser de fotos de fichas.

---

## 5. Backlog v1.1

Itens conscientemente **não entregues** nesta sprint. Prontos pra próxima:

- **`aria-haspopup`** em outros botões de disclosure (já feito em `FlashcardDuel`)
- **Hidden achievements** (Noturno, Coruja, Maratonista) — existem no catálogo,
  mas a UI não os reconhece em tempo real ainda
- **OCR de foto de prova antiga** no setup `/prova` — hoje só aceita URL de
  Supabase Storage; parser OCR fica pra v1.1
- **Push notifications** (lembrete véspera de prova) — PWA config existe,
  falta fluxo de opt-in em `/perfil`
- **Dashboard de pais** (visibilidade opcional) — fora do escopo v1 por decisão
  consciente. Henrique precisa sentir que é **espaço dele**, não monitoramento
- **Modo Prova: múltiplas provas ativas** — hoje 1 expedição por vez; se o
  Henrique quiser montar matemática + história em paralelo, v1.1

---

## 6. Agradecimentos nerds

- **Reality Checker** por bloquear 2 entregas ruins antes do merge
- **Game Designer** por definir "estudo = esporte, não jogo infantil" e segurar
  o princípio de "mastery, não bribes" no pivô sandbox
- **UI Designer v2** pelo reskin esports→sandbox sem regressões visuais
- **CISO** pelos 5 bloqueantes pré-flight (RLS gap `xp_events`, power-up race,
  CSP sem Supabase, TTS sem auth, Consent v2 sem nomear provedores)
- **tdd-guide** pela teimosia RED→GREEN — 522/523 passando, cobertura 89%

---

## 7. Próxima sprint — recomendações

1. Integration contract (types compartilhados) antes de disparar backend+frontend paralelos
2. Checklist por fase — "disparado" ≠ "concluído"
3. Reality Checker com `Read` obrigatório antes de citar linha
4. Budget alert OpenAI em $10/dia — piloto é Henrique sozinho, mas abrir pra 10 crianças vira real rápido
5. Telemetria do simulado — precisamos saber se AV2 antecipou questões. Valida o produto inteiro.
