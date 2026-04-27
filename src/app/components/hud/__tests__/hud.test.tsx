import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { TierBadge } from "../TierBadge";
import { XpBar } from "../XpBar";
import { QuestCard } from "../QuestCard";
import { FlashcardDuel } from "../FlashcardDuel";
import { PowerUpChip } from "../PowerUpChip";
import { AchievementShard } from "../AchievementShard";
import { StatusBar } from "../StatusBar";
import { HeatmapByMatter } from "../HeatmapByMatter";
import { ArenaShell } from "../ArenaShell";
import type {
  Achievement,
  Flashcard,
  PowerUp,
  Profile,
  Quest,
} from "@/lib/gamification/types";

// ---------------------------------------------------------------------------
// TierBadge
// ---------------------------------------------------------------------------

describe("TierBadge", () => {
  it("renders the division number", () => {
    render(
      <TierBadge tier={{ rank: "batedor", division: "II" }} size="inline" />
    );
    expect(screen.getByText("II")).toBeInTheDocument();
  });

  it("renders the rank label when `label` is true", () => {
    render(
      <TierBadge
        tier={{ rank: "coletor", division: "I" }}
        size="large"
        label
      />
    );
    expect(screen.getByText(/Coletor I/)).toBeInTheDocument();
  });

  it("exposes an accessible label", () => {
    render(
      <TierBadge tier={{ rank: "explorador", division: "III" }} size="inline" />
    );
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      "Tier Explorador III"
    );
  });
});

// ---------------------------------------------------------------------------
// XpBar
// ---------------------------------------------------------------------------

describe("XpBar", () => {
  it("renders progressbar with correct aria values", () => {
    render(<XpBar current={150} max={300} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "150");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "300");
  });

  it("clamps values over max to 100 percent", () => {
    render(<XpBar current={500} max={100} />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders numbers when showNumbers is true", () => {
    render(<XpBar current={42} max={100} showNumbers label="XP" />);
    expect(screen.getByText(/42 \/ 100/)).toBeInTheDocument();
  });

  it("falls back safely when max is 0", () => {
    render(<XpBar current={0} max={0} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuemax",
      "0"
    );
  });
});

// ---------------------------------------------------------------------------
// QuestCard
// ---------------------------------------------------------------------------

const baseQuest: Quest = {
  id: "q-1",
  subject: "matematica",
  title: "Função Quadrática",
  description: "3 exercícios guiados.",
  objectivesDone: 2,
  objectivesTotal: 5,
  xpReward: 150,
  estimatedMinutes: 15,
  status: "idle",
};

describe("QuestCard", () => {
  it("shows subject label, title, and description", () => {
    render(<QuestCard quest={baseQuest} />);
    expect(screen.getByText(/Matemática/)).toBeInTheDocument();
    expect(screen.getByText("Função Quadrática")).toBeInTheDocument();
    expect(screen.getByText(/exercícios guiados/)).toBeInTheDocument();
  });

  it("shows progress and XP reward in HUD style", () => {
    render(<QuestCard quest={baseQuest} />);
    expect(screen.getByText("2/5")).toBeInTheDocument();
    expect(screen.getByText(/\+150 XP/)).toBeInTheDocument();
    expect(screen.getByText(/~15min/)).toBeInTheDocument();
  });

  it("calls onStart when the start button is clicked", () => {
    const onStart = jest.fn();
    render(<QuestCard quest={baseQuest} onStart={onStart} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Começar etapa/i })
    );
    expect(onStart).toHaveBeenCalledWith(baseQuest);
  });

  it("omits start button when completed", () => {
    render(
      <QuestCard
        quest={{ ...baseQuest, status: "completed" }}
        onStart={() => {}}
      />
    );
    expect(
      screen.queryByRole("button", { name: /Começar etapa/i })
    ).not.toBeInTheDocument();
  });

  it("applies pulsing class when active", () => {
    const { container } = render(
      <QuestCard quest={{ ...baseQuest, status: "active" }} />
    );
    expect(container.querySelector(".quest-active-pulse")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// FlashcardDuel
// ---------------------------------------------------------------------------

const sampleCard: Flashcard = {
  id: "fc-1",
  subject: "matematica",
  topic: "Função Quadrática",
  front: "Qual a forma geral?",
  back: "f(x) = ax² + bx + c",
};

describe("FlashcardDuel", () => {
  it("shows the front, hides the back initially", () => {
    render(<FlashcardDuel card={sampleCard} onGrade={() => {}} />);
    expect(screen.getByText("Qual a forma geral?")).toBeInTheDocument();
    expect(screen.queryByText(/f\(x\) = ax²/)).not.toBeInTheDocument();
  });

  it("reveals the back when 'Revelar resposta' is clicked", () => {
    render(<FlashcardDuel card={sampleCard} onGrade={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Revelar resposta/i }));
    expect(screen.getByText(/f\(x\) = ax²/)).toBeInTheDocument();
  });

  it("disables grade buttons until revealed", () => {
    render(<FlashcardDuel card={sampleCard} onGrade={() => {}} />);
    expect(screen.getByRole("button", { name: "Acertei" })).toBeDisabled();
  });

  it("calls onGrade with the selected grade", () => {
    const onGrade = jest.fn();
    render(<FlashcardDuel card={sampleCard} onGrade={onGrade} />);
    fireEvent.click(screen.getByRole("button", { name: /Revelar resposta/i }));
    fireEvent.click(screen.getByRole("button", { name: "Acertei" }));
    expect(onGrade).toHaveBeenCalledWith("acertei");
  });

  it("exposes disclosure semantics on 'Revelar resposta' button", () => {
    // WAI-ARIA Authoring Practices: show/hide-inline-content pattern uses
    // aria-expanded + aria-controls on the trigger (not aria-haspopup).
    render(<FlashcardDuel card={sampleCard} onGrade={() => {}} />);
    const revealBtn = screen.getByRole("button", { name: /Revelar resposta/i });
    expect(revealBtn).toHaveAttribute("aria-expanded", "false");
    expect(revealBtn).toHaveAttribute("aria-controls", "flashcard-answer");
  });

  it("flips aria-expanded to true and exposes the controlled container", () => {
    const { container } = render(
      <FlashcardDuel card={sampleCard} onGrade={() => {}} />
    );
    fireEvent.click(screen.getByRole("button", { name: /Revelar resposta/i }));
    // After reveal the button is replaced by the answer container; its id
    // must match the aria-controls value used when the button was present.
    const answer = container.querySelector("#flashcard-answer");
    expect(answer).not.toBeNull();
    expect(answer).toHaveTextContent(/f\(x\) = ax²/);
  });
});

// ---------------------------------------------------------------------------
// PowerUpChip
// ---------------------------------------------------------------------------

const powerUp: PowerUp = {
  id: "bussola",
  name: "Bússola",
  description: "3 cards rápidos de um tópico fraco.",
  charges: 2,
};

describe("PowerUpChip", () => {
  it("shows name, description, and charges", () => {
    render(<PowerUpChip powerUp={powerUp} />);
    expect(screen.getByText("Bússola")).toBeInTheDocument();
    expect(screen.getByText(/cards rápidos/)).toBeInTheDocument();
    expect(screen.getByText("×2")).toBeInTheDocument();
  });

  it("calls onUse when clicked", () => {
    const onUse = jest.fn();
    render(<PowerUpChip powerUp={powerUp} onUse={onUse} />);
    fireEvent.click(screen.getByRole("button", { name: /Usar/i }));
    expect(onUse).toHaveBeenCalledWith(powerUp);
  });

  it("disables use button when charges are zero", () => {
    const onUse = jest.fn();
    render(<PowerUpChip powerUp={{ ...powerUp, charges: 0 }} onUse={onUse} />);
    expect(screen.getByRole("button", { name: /Usar/i })).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// AchievementShard
// ---------------------------------------------------------------------------

const achievement: Achievement = {
  id: "a-1",
  title: "Primeira missão",
  description: "Completou a primeira.",
  unlockedAtIso: "2026-04-20T19:00:00-03:00",
};

describe("AchievementShard", () => {
  it("renders nothing when closed and never opened", () => {
    const { container } = render(
      <AchievementShard
        achievement={achievement}
        open={false}
        onDismiss={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders title and description when open", () => {
    render(
      <AchievementShard
        achievement={achievement}
        open
        onDismiss={() => {}}
      />
    );
    expect(screen.getByText("Primeira missão")).toBeInTheDocument();
    expect(screen.getByText("Completou a primeira.")).toBeInTheDocument();
  });

  it("calls onDismiss when continue button clicked", () => {
    const onDismiss = jest.fn();
    render(
      <AchievementShard
        achievement={achievement}
        open
        onDismiss={onDismiss}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Continuar/i }));
    expect(onDismiss).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// StatusBar
// ---------------------------------------------------------------------------

const statusProfile: Pick<
  Profile,
  "tier" | "currentXp" | "xpForNext" | "streak" | "totalXp"
> = {
  tier: { rank: "batedor", division: "II" },
  currentXp: 640,
  xpForNext: 1000,
  streak: { days: 6, lastActiveIso: "2026-04-19T21:12:00-03:00" },
  // Non-zero totalXp keeps the division marker visible — the fresh-start
  // branch in StatusBar only hides "II/III" when totalXp === 0.
  totalXp: 2640,
};

const freshStatusProfile: Pick<
  Profile,
  "tier" | "currentXp" | "xpForNext" | "streak" | "totalXp"
> = {
  tier: { rank: "aprendiz", division: "III" },
  currentXp: 0,
  xpForNext: 600,
  streak: { days: 0, lastActiveIso: "" },
  totalXp: 0,
};

describe("StatusBar", () => {
  it("renders the tier label and streak", () => {
    render(<StatusBar profile={statusProfile} />);
    expect(screen.getByText(/Batedor II/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Sequência: 6 dias/)).toBeInTheDocument();
  });

  it("hides division for fresh accounts (totalXp = 0)", () => {
    render(<StatusBar profile={freshStatusProfile} />);
    // Just "Aprendiz" — no "III" pip yet, since the kid hasn't earned
    // anything to celebrate. The TierBadge alongside still shows the rank.
    expect(screen.getByText(/^Aprendiz$/i)).toBeInTheDocument();
    expect(screen.queryByText(/Aprendiz III/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// HeatmapByMatter
// ---------------------------------------------------------------------------

describe("HeatmapByMatter", () => {
  it("renders one cell per day", () => {
    const values = [5, 0, 10, 0, 15, 20, 0];
    render(<HeatmapByMatter values={values} label="Atividade" />);
    expect(screen.getByText("Atividade")).toBeInTheDocument();
    const cells = screen.getAllByRole("button");
    expect(cells).toHaveLength(7);
  });

  it("shows minute count in status on hover", () => {
    render(<HeatmapByMatter values={[10, 20, 30, 40, 50, 60, 70]} />);
    const cells = screen.getAllByRole("button");
    fireEvent.mouseEnter(cells[3]);
    expect(screen.getByRole("status")).toHaveTextContent(/40 min/);
  });
});

// ---------------------------------------------------------------------------
// ArenaShell
// ---------------------------------------------------------------------------

describe("ArenaShell", () => {
  it("renders children and title", () => {
    render(
      <ArenaShell title="teste">
        <p>conteúdo</p>
      </ArenaShell>
    );
    expect(screen.getByText("conteúdo")).toBeInTheDocument();
    expect(screen.getByText(/travessia · teste/)).toBeInTheDocument();
  });

  it("calls onExit when Sair is clicked", () => {
    const onExit = jest.fn();
    render(
      <ArenaShell title="teste" onExit={onExit}>
        <p>conteúdo</p>
      </ArenaShell>
    );
    fireEvent.click(screen.getByRole("button", { name: /Sair/i }));
    expect(onExit).toHaveBeenCalled();
  });

  it("omits exit button when onExit is not provided", () => {
    render(
      <ArenaShell title="teste">
        <p>conteúdo</p>
      </ArenaShell>
    );
    expect(
      screen.queryByRole("button", { name: /Sair/i })
    ).not.toBeInTheDocument();
  });
});
