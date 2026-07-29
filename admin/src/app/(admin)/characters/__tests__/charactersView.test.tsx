import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import CharacterDetailPage from "../[id]/page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "char-1" }),
}));

const DB_ROW = {
  id: "char-1",
  name: "Ada",
  title: "Runner",
  description: "Street doc",
  portrait_urls: [{ url: "https://cdn.test/ada.png" }],
  relationships: [
    {
      target_id: "c2",
      type: "friend",
      closeness: 80,
      trust: 70,
      context: "Met in grid",
    },
  ],
  metadata: { role: "Doc" },
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-02T00:00:00Z",
  lore_path: "characters/ada/ada.md",
  asset_paths: { portrait: "ada__default.png" },
};

vi.mock("@/lib/client-api", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/client-api")>(
      "@/lib/client-api",
    );
  return {
    ...actual,
    adminFetch: vi.fn(),
  };
});

import { adminFetch } from "@/lib/client-api";

describe("CharacterDetailPage", () => {
  beforeEach(() => {
    (adminFetch as ReturnType<typeof vi.fn>).mockClear();
  });

  it("renders readable fields instead of JSON dump", async () => {
    (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      data: DB_ROW,
    });
    render(<CharacterDetailPage />);

    expect(
      await screen.findByRole("heading", { name: "Character: Ada" }),
    ).toBeDefined();
    expect(screen.getByText("Street doc")).toBeDefined();
    expect(screen.getByText("Runner")).toBeDefined();
    expect(document.querySelector("pre")).toBeNull();
  });

  it("shows portrait status badge and edit link", async () => {
    (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      data: DB_ROW,
    });
    render(<CharacterDetailPage />);

    const badge = await screen.findByText("ready");
    expect(badge.textContent).toBe("ready");

    const editLink = screen.getByRole("link", { name: /edit/i });
    expect(editLink).toHaveAttribute("href", "/characters/char-1/edit");
  });

  it("renders metadata and relationship table", async () => {
    (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      data: DB_ROW,
    });
    render(<CharacterDetailPage />);

    expect(await screen.findByText("Doc", { exact: true })).toBeDefined();
    expect(screen.getByText("friend")).toBeDefined();
    expect(screen.getByText("Met in grid")).toBeDefined();
  });

  it("renders error on API failure", async () => {
    (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: "Boom",
    });
    render(<CharacterDetailPage />);

    expect(await screen.findByText("Boom")).toBeDefined();
  });

  it("renders not found on 404", async () => {
    const err = new Error("fail") as any;
    err.status = 404;
    (adminFetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(err);
    render(<CharacterDetailPage />);

    expect(await screen.findByText("Not found.")).toBeDefined();
  });
});
