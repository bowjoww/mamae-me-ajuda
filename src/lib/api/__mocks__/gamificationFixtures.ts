/**
 * MOCK fixtures — fallback payloads used when the live endpoints are
 * unreachable (offline, or `NEXT_PUBLIC_USE_MOCK_GAMIFICATION=1`).
 *
 * All shapes conform to `src/lib/gamification/types.ts`. Copy follows the
 * exploration/crafting tone (see types.ts and migration 004).
 */

import type {
  Achievement,
  Flashcard,
  Mission,
  PowerUp,
  Profile,
  Quest,
  StudyPlan,
  SubjectProgress,
  TopicRow,
} from "@/lib/gamification/types";

const subjectProgress: SubjectProgress[] = [
  {
    subject: "matematica",
    tier: { rank: "batedor", division: "II" },
    currentXp: 640,
    xpForNext: 1000,
  },
  {
    subject: "portugues",
    tier: { rank: "explorador", division: "III" },
    currentXp: 220,
    xpForNext: 1200,
  },
  {
    subject: "ciencias",
    tier: { rank: "batedor", division: "I" },
    currentXp: 880,
    xpForNext: 1000,
  },
  {
    subject: "historia",
    tier: { rank: "aprendiz", division: "I" },
    currentXp: 420,
    xpForNext: 600,
  },
  {
    subject: "geografia",
    tier: { rank: "aprendiz", division: "II" },
    currentXp: 150,
    xpForNext: 600,
  },
  {
    subject: "ingles",
    tier: { rank: "batedor", division: "III" },
    currentXp: 50,
    xpForNext: 800,
  },
];

const achievements: Achievement[] = [
  {
    id: "first-strike",
    title: "Primeira faísca",
    description: "Terminou a primeira etapa da coleta.",
    unlockedAtIso: "2026-04-08T19:12:00-03:00",
  },
  {
    id: "seven-day-streak",
    title: "Sete dias seguidos",
    description: "Apareceu sete sessões sem falhar.",
    unlockedAtIso: "2026-04-14T20:03:00-03:00",
  },
  {
    id: "math-batedor",
    title: "Batedor de Matemática",
    description: "Alcançou o rank Batedor em Matemática.",
    unlockedAtIso: "2026-04-17T17:40:00-03:00",
    subject: "matematica",
  },
  {
    id: "no-shortcut",
    title: "Sem atalhos",
    description: "10 exercícios resolvidos sem pedir resposta direta.",
    unlockedAtIso: null,
  },
  {
    id: "night-owl",
    title: "Coruja",
    description: "5 sessões completadas depois das 21h.",
    unlockedAtIso: null,
  },
  {
    id: "boss-slayer",
    title: "Travessia completa",
    description: "Concluiu uma Expedição com nota ≥ 80%.",
    unlockedAtIso: null,
  },
  {
    id: "multi-front",
    title: "Muitas trilhas",
    description: "Avançou em 4 matérias na mesma semana.",
    unlockedAtIso: null,
  },
  {
    id: "marksman",
    title: "Pulso firme",
    description: "90% de acerto em uma coleta de 20 cards.",
    unlockedAtIso: null,
  },
];

const inventory: PowerUp[] = [
  {
    id: "bussola",
    name: "Bússola",
    description:
      "Aponta um tópico fraco e gera 3 cartas rápidas daquele rumo.",
    charges: 2,
  },
  {
    id: "livro-de-receitas",
    name: "Livro de Receitas",
    description:
      "Mostra como a IA pensaria o problema, passo a passo. Nunca a resposta.",
    charges: 1,
  },
];

export const mockProfile: Profile = {
  studentName: "Henrique",
  title: "Batedor",
  totalXp: 2360,
  tier: { rank: "batedor", division: "II" },
  currentXp: 640,
  xpForNext: 1000,
  streak: { days: 6, lastActiveIso: "2026-04-19T21:12:00-03:00" },
  subjects: subjectProgress,
  activity7d: [12, 28, 0, 35, 20, 44, 38],
  achievements,
  inventory,
};

export const mockQuests: Quest[] = [
  {
    id: "q-math-quad",
    subject: "matematica",
    title: "Função Quadrática",
    description:
      "Fatoração, vértice e raízes. Três exercícios guiados, sem resposta direta.",
    objectivesDone: 2,
    objectivesTotal: 5,
    xpReward: 180,
    estimatedMinutes: 18,
    status: "active",
    featured: true,
  },
  {
    id: "q-port-verb",
    subject: "portugues",
    title: "Concordância verbal",
    description: "Sujeito composto e casos especiais.",
    objectivesDone: 0,
    objectivesTotal: 4,
    xpReward: 120,
    estimatedMinutes: 12,
    status: "idle",
  },
  {
    id: "q-sci-celula",
    subject: "ciencias",
    title: "Célula animal vs vegetal",
    description: "Organelas exclusivas e funções comparadas.",
    objectivesDone: 0,
    objectivesTotal: 3,
    xpReward: 100,
    estimatedMinutes: 10,
    status: "idle",
  },
];

export const mockFlashcards: Flashcard[] = [
  {
    id: "fc-1",
    subject: "matematica",
    topic: "Função Quadrática",
    front:
      "Qual é a forma geral de uma função quadrática? Explique os papéis de a, b e c.",
    back:
      "f(x) = ax² + bx + c, com a ≠ 0. O coeficiente a define a concavidade, b desloca o eixo, c é a intersecção com y.",
  },
  {
    id: "fc-2",
    subject: "matematica",
    topic: "Função Quadrática",
    front: "O que é o vértice da parábola e como encontrá-lo?",
    back:
      "É o ponto de mínimo (se a>0) ou máximo (se a<0). Coordenadas: x = -b/(2a), y = f(x).",
  },
  {
    id: "fc-3",
    subject: "matematica",
    topic: "Função Quadrática",
    front: "Enuncie a fórmula de Bhaskara.",
    back: "x = (-b ± √(b² - 4ac)) / (2a). Δ = b² - 4ac determina o número de raízes reais.",
  },
];

export const mockTopics: TopicRow[] = [
  {
    topic: "Função Quadrática",
    subject: "matematica",
    mastery: "progress",
    lastStudiedIso: "2026-04-19T20:02:00-03:00",
  },
  {
    topic: "Equação do 1º grau",
    subject: "matematica",
    mastery: "mastered",
    lastStudiedIso: "2026-04-12T19:30:00-03:00",
  },
  {
    topic: "Geometria plana",
    subject: "matematica",
    mastery: "new",
    lastStudiedIso: null,
  },
  {
    topic: "Concordância verbal",
    subject: "portugues",
    mastery: "new",
    lastStudiedIso: null,
  },
  {
    topic: "Célula animal",
    subject: "ciencias",
    mastery: "progress",
    lastStudiedIso: "2026-04-18T18:20:00-03:00",
  },
];

const missions: Mission[] = [
  {
    id: "m-open",
    kind: "abertura",
    title: "Abertura",
    subtitle: "Entender o formato da Prova e o que cai.",
    status: "completed",
    progress: { done: 1, total: 1 },
    estimatedMinutes: 5,
  },
  {
    id: "m-trail",
    kind: "trilha",
    title: "Trilha",
    subtitle: "Mapear conceitos fracos e fortes.",
    status: "completed",
    progress: { done: 3, total: 3 },
    estimatedMinutes: 12,
  },
  {
    id: "m-workshop",
    kind: "oficina",
    title: "Oficina",
    subtitle: "Exercícios dos 3 tópicos mais fracos.",
    status: "active",
    progress: { done: 4, total: 8 },
    estimatedMinutes: 25,
  },
  {
    id: "m-rehearsal",
    kind: "ensaio",
    title: "Ensaio",
    subtitle: "60 questões no formato da Prova real.",
    status: "idle",
    progress: { done: 0, total: 1 },
    estimatedMinutes: 60,
  },
  {
    id: "m-prova",
    kind: "prova",
    title: "A Prova",
    subtitle: "A Prova de verdade da escola. Boa sorte.",
    status: "idle",
    progress: { done: 0, total: 1 },
    estimatedMinutes: 90,
  },
];

export const mockStudyPlan: StudyPlan = {
  id: "plan-1",
  title: "Matemática · 7º ano",
  subject: "matematica",
  examDateIso: "2026-04-28T08:00:00-03:00",
  createdAtIso: "2026-04-14T18:00:00-03:00",
  tier: { rank: "batedor", division: "II" },
  missions,
};
