import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  usePathname: () => "/perfil",
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

jest.mock("@/lib/api/gamificationClient", () => {
  const { mockProfile } = jest.requireActual(
    "@/lib/api/__mocks__/gamificationFixtures"
  );
  return {
    fetchProfile: jest.fn().mockResolvedValue(mockProfile),
  };
});

import PerfilPage from "../perfil/page";
import { fetchProfile } from "@/lib/api/gamificationClient";
import { mockProfile } from "@/lib/api/__mocks__/gamificationFixtures";

describe("PerfilPage", () => {
  beforeEach(() => {
    (fetchProfile as jest.Mock).mockReset();
    (fetchProfile as jest.Mock).mockResolvedValue(mockProfile);
  });

  it("renders name, title and total XP", async () => {
    render(<PerfilPage />);
    await waitFor(() =>
      expect(screen.getByText("Henrique")).toBeInTheDocument()
    );
    expect(screen.getAllByText(/Batedor/).length).toBeGreaterThan(0);
    expect(screen.getByText(/2\.360|2,360/)).toBeInTheDocument();
  });

  it("renders matter badges and achievements grid", async () => {
    render(<PerfilPage />);
    await waitFor(() =>
      expect(screen.getByText(/Conquistas/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/Últimos 7 dias/i)).toBeInTheDocument();
    expect(screen.getByText(/Mochila/i)).toBeInTheDocument();
  });

  it("renders the backpack error state and recovers on retry when fetchProfile throws", async () => {
    // First call rejects — simulates Supabase down / 500 / auth expired.
    (fetchProfile as jest.Mock)
      .mockRejectedValueOnce(new Error("HTTP 500 on gamification-profile"))
      .mockResolvedValueOnce(mockProfile);

    render(<PerfilPage />);

    const retryBtn = await screen.findByRole("button", {
      name: /Tentar de novo/i,
    });
    expect(
      screen.getByText(/Mochila sumiu por um segundo/i)
    ).toBeInTheDocument();

    // Retry -> second call resolves with the profile.
    await act(async () => {
      fireEvent.click(retryBtn);
    });

    await waitFor(() =>
      expect(screen.getByText("Henrique")).toBeInTheDocument()
    );
  });

  it("shows an empty-state message when the profile has zero achievements (dia-zero)", async () => {
    (fetchProfile as jest.Mock).mockResolvedValueOnce({
      ...mockProfile,
      achievements: [],
      inventory: [],
    });

    render(<PerfilPage />);

    await waitFor(() =>
      expect(screen.getByText("Henrique")).toBeInTheDocument()
    );
    expect(
      screen.getByText(/Sem registros ainda\. Quando você começar a coletar/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Mochila vazia\. Power-ups aparecem aqui/i)
    ).toBeInTheDocument();
  });

  it("exposes the LGPD Art. 18 data export link", async () => {
    render(<PerfilPage />);
    await waitFor(() =>
      expect(screen.getByText("Henrique")).toBeInTheDocument()
    );
    const exportLink = screen.getByRole("link", {
      name: /Exportar meus dados/i,
    });
    expect(exportLink).toHaveAttribute("href", "/api/account/export");
  });
});
