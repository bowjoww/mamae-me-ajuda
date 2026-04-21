import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  usePathname: () => "/prova",
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
  const {
    mockProfile,
    mockStudyPlan,
  } = jest.requireActual("@/lib/api/__mocks__/gamificationFixtures");
  return {
    fetchProfile: jest.fn().mockResolvedValue(mockProfile),
    fetchStudyPlan: jest.fn().mockResolvedValue(mockStudyPlan),
  };
});

import ProvaPage from "../prova/page";
import {
  fetchProfile,
  fetchStudyPlan,
} from "@/lib/api/gamificationClient";
import {
  mockProfile,
  mockStudyPlan,
} from "@/lib/api/__mocks__/gamificationFixtures";

describe("ProvaPage", () => {
  beforeEach(() => {
    (fetchProfile as jest.Mock).mockReset();
    (fetchStudyPlan as jest.Mock).mockReset();
    (fetchProfile as jest.Mock).mockResolvedValue(mockProfile);
    (fetchStudyPlan as jest.Mock).mockResolvedValue(mockStudyPlan);
  });

  it("renders active expedition timeline with missions", async () => {
    render(<ProvaPage />);
    await waitFor(() =>
      expect(screen.getByText(/Expedição · Matemática/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/Matemática · 7º ano/)).toBeInTheDocument();
    // Mission titles from the expedition fixture
    expect(screen.getByText("Abertura")).toBeInTheDocument();
    expect(screen.getAllByText(/Trilha/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Ensaio/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/A Prova/).length).toBeGreaterThan(0);
  });

  it("shows T-minus countdown", async () => {
    render(<ProvaPage />);
    await waitFor(() =>
      expect(screen.getByText(/T−\d+ dias/)).toBeInTheDocument()
    );
  });

  it("renders the expedition error state and recovers on retry when fetchProfile throws", async () => {
    (fetchProfile as jest.Mock)
      .mockRejectedValueOnce(new Error("HTTP 500 on gamification-profile"))
      .mockResolvedValueOnce(mockProfile);

    render(<ProvaPage />);

    const retryBtn = await screen.findByRole("button", {
      name: /Tentar de novo/i,
    });
    expect(
      screen.getByText(/Expedição não carregou/i)
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(retryBtn);
    });

    await waitFor(() =>
      expect(screen.getByText(/Expedição · Matemática/i)).toBeInTheDocument()
    );
  });
});
