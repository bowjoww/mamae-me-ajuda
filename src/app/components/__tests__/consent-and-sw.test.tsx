import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock consent lib so we can control what it does
const mockSaveConsentLocally = jest.fn();
jest.mock("@/lib/consent", () => ({
  CONSENT_POLICY_VERSION: "2026-04-01",
  saveConsentLocally: (...args: unknown[]) => mockSaveConsentLocally(...args),
}));

// Mock fetch so the best-effort POST doesn't fail in jsdom
global.fetch = jest.fn().mockResolvedValue({ ok: true });

// Mock navigator.serviceWorker
const mockRegister = jest.fn().mockResolvedValue({});
Object.defineProperty(navigator, "serviceWorker", {
  value: { register: mockRegister },
  writable: true,
  configurable: true,
});

import { ConsentModal } from "../ConsentModal";
import { ServiceWorkerRegistration } from "../ServiceWorkerRegistration";

// ---------------------------------------------------------------------------
// ConsentModal
// ---------------------------------------------------------------------------

describe("ConsentModal", () => {
  const onAccept = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the consent dialog", () => {
    render(<ConsentModal onAccept={onAccept} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Consentimento Parental/i)).toBeInTheDocument();
  });

  it("accept button is disabled when checkbox is unchecked", () => {
    render(<ConsentModal onAccept={onAccept} />);
    const btn = screen.getByRole("button", { name: /Aceitar e continuar/i });
    expect(btn).toBeDisabled();
  });

  it("accept button becomes enabled after checking the checkbox", () => {
    render(<ConsentModal onAccept={onAccept} />);
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    expect(screen.getByRole("button", { name: /Aceitar e continuar/i })).toBeEnabled();
  });

  it("calls saveConsentLocally and onAccept when accepted", async () => {
    render(<ConsentModal onAccept={onAccept} />);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Aceitar e continuar/i }));
    await waitFor(() => {
      expect(mockSaveConsentLocally).toHaveBeenCalledTimes(1);
      expect(onAccept).toHaveBeenCalledTimes(1);
    });
  });

  it("does not call onAccept when checkbox is not checked", () => {
    render(<ConsentModal onAccept={onAccept} />);
    fireEvent.click(screen.getByRole("button", { name: /Aceitar e continuar/i }));
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("shows refuse screen when Recusar is clicked", () => {
    render(<ConsentModal onAccept={onAccept} />);
    fireEvent.click(screen.getByRole("button", { name: /Recusar/i }));
    expect(screen.getByText(/Sem consentimento, sem acesso/i)).toBeInTheDocument();
  });

  it("goes back to consent form when 'Voltar aos termos' is clicked", () => {
    render(<ConsentModal onAccept={onAccept} />);
    fireEvent.click(screen.getByRole("button", { name: /Recusar/i }));
    fireEvent.click(screen.getByRole("button", { name: /Voltar aos termos/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("renders the link to the privacy policy", () => {
    render(<ConsentModal onAccept={onAccept} />);
    const link = screen.getByRole("link", { name: /Política de Privacidade/i });
    expect(link).toHaveAttribute("href", "/privacidade");
  });

  it("fires best-effort fetch to /api/consent after accepting", async () => {
    render(<ConsentModal onAccept={onAccept} />);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Aceitar e continuar/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/consent",
        expect.objectContaining({ method: "POST" })
      );
    });
  });
});

// ---------------------------------------------------------------------------
// ServiceWorkerRegistration
// ---------------------------------------------------------------------------

describe("ServiceWorkerRegistration", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders nothing (returns null)", () => {
    const { container } = render(<ServiceWorkerRegistration />);
    expect(container.firstChild).toBeNull();
  });

  it("registers the service worker on mount", async () => {
    render(<ServiceWorkerRegistration />);
    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith("/sw.js", { scope: "/" });
    });
  });
});
