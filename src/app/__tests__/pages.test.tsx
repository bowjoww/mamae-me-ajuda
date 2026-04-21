import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

// ---------------------------------------------------------------------------
// OfflinePage
// ---------------------------------------------------------------------------

import OfflinePage from "../offline/page";

describe("OfflinePage", () => {
  it("renders the offline heading", () => {
    render(<OfflinePage />);
    expect(screen.getByRole("heading", { name: /Sem conexão com a internet/i })).toBeInTheDocument();
  });

  it("renders the retry button", () => {
    render(<OfflinePage />);
    expect(screen.getByRole("button", { name: /Tentar de novo/i })).toBeInTheDocument();
  });

  it("clicking the retry button does not throw", () => {
    // jsdom's window.location.reload is a no-op — verify click is handled without error
    render(<OfflinePage />);
    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: /Tentar de novo/i }))
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// PrivacidadePage
// ---------------------------------------------------------------------------

// next/link resolves to a plain <a> in jest/jsdom
jest.mock("next/link", () => {
  const MockLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  MockLink.displayName = "MockLink";
  return MockLink;
});

import PrivacidadePage from "../privacidade/page";

describe("PrivacidadePage", () => {
  it("renders the main Privacy Policy heading", () => {
    render(<PrivacidadePage />);
    expect(
      screen.getByRole("heading", { name: /Política de Privacidade/i })
    ).toBeInTheDocument();
  });

  it("renders back-to-app link", () => {
    render(<PrivacidadePage />);
    const link = screen.getByRole("link", { name: /Voltar ao app/i });
    expect(link).toHaveAttribute("href", "/");
  });

  it("renders required LGPD section", () => {
    render(<PrivacidadePage />);
    const lgpdHeading = screen.getByRole("heading", { name: /Dados de menores/i });
    expect(lgpdHeading).toBeInTheDocument();
  });

  it("renders DPO contact email", () => {
    render(<PrivacidadePage />);
    const emailLink = screen.getAllByRole("link", { name: /dpo@mamaemeajuda.com.br/i });
    expect(emailLink.length).toBeGreaterThan(0);
  });

  // LGPD Art. 9, IV — transparency about controllers/operators. Mirrors the
  // ConsentModal assertion so both surfaces are enforced by tests.
  it("names OpenAI, GPT, Google, Gemini as operators in section 5", () => {
    render(<PrivacidadePage />);
    expect(screen.getByText(/OpenAI/)).toBeInTheDocument();
    expect(screen.getByText(/GPT/)).toBeInTheDocument();
    expect(screen.getByText(/Google/)).toBeInTheDocument();
    expect(screen.getByText(/Gemini/)).toBeInTheDocument();
  });

  it("exposes the LGPD Art. 18 data export endpoint in section 6", () => {
    render(<PrivacidadePage />);
    const exportLink = screen.getByRole("link", {
      name: /\/api\/account\/export/,
    });
    expect(exportLink).toHaveAttribute("href", "/api/account/export");
  });
});
