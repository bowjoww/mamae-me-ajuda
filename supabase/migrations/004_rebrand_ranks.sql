-- Mamãe Me Ajuda — Rebrand: esports militar → exploração/crafting.
--
-- Henrique joga Minecraft, Roblox e Don't Starve. Os nomes antigos (Recruta,
-- Operador, Analista, Tático, Estrategista, Mentor, Arquimestre) vinham de um
-- palpite errado de persona. A mecânica do motor não muda — 7 tiers × 3
-- divisões, SM-2, XP por engajamento socrático. Só os rótulos mudam.
--
-- Idempotente: todas as operações usam UPDATE/ON CONFLICT, nada dropa colunas
-- e nenhum dado existente é destruído.
--
-- Rank map (old → new):
--   Recruta       → Aprendiz
--   Operador      → Batedor
--   Analista      → Explorador
--   Tático        → Coletor
--   Estrategista  → Artesão
--   Mentor        → Cartógrafo
--   Arquimestre   → Mestre

-- ─── user_profile: renomear default e dados existentes ────────────────────────

-- 1. Bump o default para o novo nome base antes de migrar os registros.
alter table public.user_profile
  alter column current_rank set default 'Aprendiz';

-- 2. Traduzir fileiras já escritas. WHERE explícito evita reescrever algo fora
--    do conjunto conhecido (caso alguém tenha feito ALTER manual).
update public.user_profile set current_rank = 'Aprendiz'    where current_rank = 'Recruta';
update public.user_profile set current_rank = 'Batedor'     where current_rank = 'Operador';
update public.user_profile set current_rank = 'Explorador'  where current_rank = 'Analista';
update public.user_profile set current_rank = 'Coletor'     where current_rank = 'Tático';
update public.user_profile set current_rank = 'Artesão'     where current_rank = 'Estrategista';
update public.user_profile set current_rank = 'Cartógrafo'  where current_rank = 'Mentor';
update public.user_profile set current_rank = 'Mestre'      where current_rank = 'Arquimestre';

-- ─── power_ups: rebrand cosmético (PK é "code", só mudam name/description) ────

update public.power_ups
  set name        = 'Tocha',
      description = 'Ilumina um passo quando você estiver perdido — libera a próxima dica socrática do card atual.'
  where code = 'dica_extra';

update public.power_ups
  set name        = 'Bússola',
      description = 'Aponta um tópico fraco e gera 3 cartas rápidas daquele rumo.'
  where code = 'revisao_relampago';

update public.power_ups
  set name        = 'Livro de Receitas',
      description = 'Mostra como a IA pensaria o problema, passo a passo. Nunca revela a resposta.'
  where code = 'insight';

update public.power_ups
  set name        = 'Pedra de Retorno',
      description = 'Reabre 1 carta que você errou para repensar, sem penalidade de streak.'
  where code = 'segunda_chance';

-- ─── achievements_catalog: apagar tom militar de dois rótulos ─────────────────
-- Os códigos continuam idênticos (referências externas preservadas). Só o
-- texto exibido muda.

update public.achievements_catalog
  set name        = 'Primeira Faísca',
      description = 'Complete seu primeiro flashcard — toda expedição começa em algum lugar.'
  where code = 'primeiro_sangue';

update public.achievements_catalog
  set name        = 'Cartógrafo Curioso',
      description = 'Acerte 5 cards usando pelo menos uma dica guiada.'
  where code = 'socratico';

update public.achievements_catalog
  set name        = 'Virada de Mesa',
      description = 'Termine uma Prova com nota acima da média depois de errar no caminho.'
  where code = 'clutch';

update public.achievements_catalog
  set name        = 'Aventureiro Paciente',
      description = 'Fique 30+ minutos em uma única sessão focada.'
  where code = 'speedrun_inverso';

update public.achievements_catalog
  set name        = 'Retorno',
      description = 'Volte a estudar após 3 dias parado — a trilha esperou.'
  where code = 'comeback';

update public.achievements_catalog
  set name        = 'Perito',
      description = 'Complete 10 flashcards sem usar dica.'
  where code = 'ace';

update public.achievements_catalog
  set name        = 'Planejador',
      description = 'Crie 3 planos de estudo — toda base precisa de projeto.'
  where code = 'estrategista';

update public.achievements_catalog
  set name        = 'Explorador',
      description = 'Revise 25 cards em tópicos distintos.'
  where code = 'mapeamento';

update public.achievements_catalog
  set name        = 'Faixa de Ouro',
      description = 'Sequência de 20 acertos sem dica.'
  where code = 'no_hint_run';

update public.achievements_catalog
  set name        = 'Revisão Honesta',
      description = 'Leia a resolução completa depois de errar 5 vezes.'
  where code = 'debrief';

update public.achievements_catalog
  set name        = 'Coruja',
      description = 'Estude entre 21h e 23h.'
  where code = 'noturno';

update public.achievements_catalog
  set name        = 'Lanterna acesa',
      description = 'Estude entre 00h e 05h.'
  where code = 'madrugada_produtiva';

update public.achievements_catalog
  set name        = 'Insistente',
      description = 'Tente o mesmo card 3+ vezes até acertar.'
  where code = 'teimoso';
