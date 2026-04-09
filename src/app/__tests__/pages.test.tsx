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
});
