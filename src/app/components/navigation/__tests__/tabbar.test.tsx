import React from "react";
import { render, screen } from "@testing-library/react";
import { TabBar } from "../TabBar";

jest.mock("next/navigation", () => ({
  usePathname: () => "/estudo",
}));

jest.mock("next/link", () => {
  const MockLink = (props: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children: React.ReactNode;
  }) => {
    const { children, ...rest } = props;
    return <a {...rest}>{children}</a>;
  };
  MockLink.displayName = "MockLink";
  return MockLink;
});

describe("TabBar", () => {
  it("renders the three tabs", () => {
    render(<TabBar />);
    expect(screen.getByText("Prova")).toBeInTheDocument();
    expect(screen.getByText("Estudo")).toBeInTheDocument();
    expect(screen.getByText("Perfil")).toBeInTheDocument();
  });

  it("marks the active tab via aria-current", () => {
    render(<TabBar />);
    const activeLink = screen.getByText("Estudo").closest("a");
    expect(activeLink).toHaveAttribute("aria-current", "page");
  });

  it("exposes navigation landmark", () => {
    render(<TabBar />);
    expect(
      screen.getByRole("navigation", { name: /Navegação principal/i })
    ).toBeInTheDocument();
  });
});
