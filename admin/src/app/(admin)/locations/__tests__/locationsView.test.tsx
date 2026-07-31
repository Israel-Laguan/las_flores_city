import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import LocationDetailPage from "../[id]/page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "loc-1" }),
}));

// DB row shape: a `scenes` row whose location-specific fields live inside the
// `metadata` JSONB column (migrated via `metadata: { ...data, type: 'location' }`).
// The detail page flattens metadata onto the record before rendering.
const DB_ROW = {
  id: "loc-1",
  name: "Plaza",
  description: "Central hub of the district",
  district_id: "d1",
  metadata: {
    type: "location",
    district: "Downtown",
    tags: ["Landmark", "Transport"],
    aliases: ["The Plaza"],
    alwaysIncludeInContext: true,
    doNotTrack: false,
    noAutoInclude: false,
    history: "Built in 2070.",
    daytime: "Bustling market by day.",
    nightlife: "Quiet at night.",
    conclusion: "A gathering place.",
    important_places: [{ name: "Fountain", description: "Central fountain" }],
  },
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-02T00:00:00Z",
  lore_path: "plaza.md",
  asset_paths: { image: "plaza__default.png" },
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

describe("LocationDetailPage", () => {
  beforeEach(() => {
    (adminFetch as ReturnType<typeof vi.fn>).mockClear();
  });

  it("renders readable fields instead of a JSON dump", async () => {
    (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      data: DB_ROW,
    });
    render(<LocationDetailPage />);

    expect(
      await screen.findByRole("heading", { name: "Location: Plaza" }),
    ).toBeDefined();
    // Description (flattened from metadata) renders as readable text
    expect(screen.getByText("Central hub of the district")).toBeDefined();
    // District is a flattened metadata field
    expect(screen.getByText("Downtown")).toBeDefined();
    // No raw <pre> JSON dump
    expect(document.querySelector("pre")).toBeNull();
  });

  it("renders tags from flattened metadata as badges", async () => {
    (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      data: DB_ROW,
    });
    render(<LocationDetailPage />);

    expect(await screen.findByText("Landmark")).toBeDefined();
    expect(screen.getByText("Transport")).toBeDefined();
  });

  it("renders the important places sub-table from flattened metadata", async () => {
    (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      data: DB_ROW,
    });
    render(<LocationDetailPage />);

    expect(await screen.findByText("Fountain")).toBeDefined();
    expect(screen.getByText("Central fountain")).toBeDefined();
  });

  it("shows an edit link to the edit route", async () => {
    (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      data: DB_ROW,
    });
    render(<LocationDetailPage />);

    const editLink = await screen.findByRole("link", { name: /edit/i });
    expect(editLink).toHaveAttribute("href", "/locations/loc-1/edit");
  });

  it("renders error on API failure", async () => {
    (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: "Boom",
    });
    render(<LocationDetailPage />);

    expect(await screen.findByText("Boom")).toBeDefined();
  });

  it("renders not found on 404", async () => {
    const err = new Error("fail") as any;
    err.status = 404;
    (adminFetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(err);
    render(<LocationDetailPage />);

    expect(await screen.findByText("Not found.")).toBeDefined();
  });
});