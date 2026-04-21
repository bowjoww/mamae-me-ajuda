import React from "react";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  usePathname: () => "/estudo",
}));

jest.mock("next/link", () => {
  const MockLink = ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>;
  MockLink.displayName = "MockLink";
  return MockLink;
});

// Use mocks so we don't depend on fetch
jest.mock("@/lib/api/gamificationClient", () => {
  const {
    mockProfile,
    mockQuests,
    mockTopics,
    mockFlashcards,
  } = jest.requireActual("@/lib/api/__mocks__/gamificationFixtures");
  return {
    fetchProfile: jest.fn().mockResolvedValue(mockProfile),
    fetchQuests: jest.fn().mockResolvedValue(mockQuests),
    fetchTopics: jest.fn().mockResolvedValue(mockTopics),
    fetchNextFlashcards: jest.fn().mockResolvedValue(mockFlashcards.slice(0, 2)),
    submitFlashcardReview: jest.fn().mockResolvedValue({
      xpAwarded: 18,
      nextReviewIso: "2026-04-21T12:00:00-03:00",
    }),
  };
});

import EstudoPage from "../estudo/page";
import {
  fetchProfile,
  fetchQuests,
  fetchTopics,
} from "@/lib/api/gamificationClient";
import {
  mockProfile,
  mockQuests,
  mockTopics,
} from "@/lib/api/__mocks__/gamificationFixtures";

describe("EstudoPage (integration)", () => {
  beforeEach(() => {
    (fetchProfile as jest.Mock).mockReset();
    (fetchQuests as jest.Mock).mockReset();
    (fetchTopics as jest.Mock).mockReset();
    (fetchProfile as jest.Mock).mockResolvedValue(mockProfile);
    (fetchQuests as jest.Mock).mockResolvedValue(mockQuests);
    (fetchTopics as jest.Mock).mockResolvedValue(mockTopics);
  });

  it("renders the hub with featured quest and CTA", async () => {
    render(<EstudoPage />);
    await waitFor(() =>
      expect(screen.getByText(/Coleta de hoje/)).toBeInTheDocument()
    );
    // Multiple elements mention "Função Quadrática" (featured quest + topic row)
    expect(
      screen.getAllByText(/Função Quadrática/).length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByRole("button", { name: /Começar coleta/i })
    ).toBeInTheDocument();
  });

  it("enters arena mode and reveals/grades flashcards", async () => {
    render(<EstudoPage />);
    await waitFor(() =>
      expect(screen.getByText(/Coleta de hoje/)).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: /Começar coleta/i }));
    await waitFor(() =>
      expect(screen.getByText(/travessia · coleta/)).toBeInTheDocument()
    );
    // Card front is visible
    expect(screen.getByText(/forma geral/i)).toBeInTheDocument();
    // Reveal + grade
    fireEvent.click(screen.getByRole("button", { name: /Revelar resposta/i }));
    fireEvent.click(screen.getByRole("button", { name: "Acertei" }));

    // Second card should be visible now
    await waitFor(() =>
      expect(screen.getByText(/vértice da parábola/i)).toBeInTheDocument()
    );
  });

  it("shows debrief after the last card", async () => {
    render(<EstudoPage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Começar coleta/i }))
        .toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: /Começar coleta/i }));

    // Grade two cards
    for (let i = 0; i < 2; i++) {
      await waitFor(() =>
        screen.getByRole("button", { name: /Revelar resposta/i })
      );
      fireEvent.click(
        screen.getByRole("button", { name: /Revelar resposta/i })
      );
      fireEvent.click(screen.getByRole("button", { name: "Acertei" }));
    }

    await waitFor(() =>
      expect(screen.getByText(/Coleta concluída/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/acertos de/i)).toBeInTheDocument();
  });

  it("renders the error state and recovers on retry when fetchQuests throws", async () => {
    // First load: quests fail (e.g. Supabase table missing migration 003).
    (fetchQuests as jest.Mock).mockRejectedValueOnce(
      new Error("HTTP 500 on gamification-quests")
    );
    (fetchQuests as jest.Mock).mockResolvedValueOnce(mockQuests);

    render(<EstudoPage />);

    const retryBtn = await screen.findByRole("button", {
      name: /Tentar de novo/i,
    });
    expect(
      screen.getByText(/Sem mapa da coleta agora/i)
    ).toBeInTheDocument();

    // Retry -> second call succeeds, hub should render.
    await act(async () => {
      fireEvent.click(retryBtn);
    });

    await waitFor(() =>
      expect(screen.getByText(/Coleta de hoje/)).toBeInTheDocument()
    );
  });

  it("shows empty-state with a pointer to /prova when there are no quests", async () => {
    (fetchQuests as jest.Mock).mockResolvedValueOnce([]);
    (fetchTopics as jest.Mock).mockResolvedValueOnce([]);

    render(<EstudoPage />);

    await waitFor(() =>
      expect(screen.getByText(/Coleta de hoje/)).toBeInTheDocument()
    );
    expect(
      screen.getByText(/Nada na mochila pra hoje\. Abre uma expedição em Prova/i)
    ).toBeInTheDocument();
    const provaLink = screen.getByRole("link", { name: /Ir pra Prova/i });
    expect(provaLink).toHaveAttribute("href", "/prova");
  });
});
