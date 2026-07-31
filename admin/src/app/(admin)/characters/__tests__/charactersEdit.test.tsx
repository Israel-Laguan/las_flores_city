import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import CharacterEditPage from "../[id]/edit/page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "550e8400-e29b-41d4-a716-446655440000" }),
}));

const YAML_RESPONSE = {
  success: true,
  data: {
    path: "characters/ada/char_ada.yaml",
    yaml: {
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Ada",
      description: "Street doc",
      lore_path: "characters/ada/ada.md",
      narrative_path: "characters/ada/ada_nar.md",
      asset_paths: { portrait: "ada__default.png" },
      relationships: [],
      metadata: {},
    },
  },
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

describe("CharacterEditPage", () => {
  beforeEach(() => {
    (adminFetch as ReturnType<typeof vi.fn>).mockClear();
  });

  it("renders an editable form from YAML state", async () => {
    (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      YAML_RESPONSE as any,
    );
    render(<CharacterEditPage />);

    expect(await screen.findByDisplayValue("Ada")).toBeDefined();
    expect(screen.getByDisplayValue("Street doc")).toBeDefined();
    expect(screen.getByText("System")).toBeDefined();
  });

  it("saves via PUT /admin/content/file with re-dumped YAML", async () => {
    (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      YAML_RESPONSE as any,
    );
    (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      data: { path: "characters/ada/char_ada.yaml", modifiedAt: "now" },
    } as any);

    render(<CharacterEditPage />);

    const nameInput = await screen.findByDisplayValue("Ada");
    fireEvent.change(nameInput, { target: { value: "Eve" } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const call = (adminFetch as ReturnType<typeof vi.fn>).mock.calls.find(
        ([url]) => url === "/admin/content/file",
      );
      expect(call).toBeDefined();
      const body = JSON.parse(
        (call as [string, RequestInit])[1].body as string,
      );
      expect(body.path).toBe("characters/ada/char_ada.yaml");
      expect(body.content).toContain("name: Eve");
    });
  });

  it("allows running migration after save", async () => {
    (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      YAML_RESPONSE as any,
    );
    (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      data: { path: "characters/ada/char_ada.yaml", modifiedAt: "now" },
    } as any);
    (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      data: {},
    } as any);
    (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      YAML_RESPONSE as any,
    );

    render(<CharacterEditPage />);

    const nameInput = await screen.findByDisplayValue("Ada");
    fireEvent.change(nameInput, { target: { value: "Eve" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const migrateButton = await screen.findByRole("button", {
      name: "Run Migration",
    });
    fireEvent.click(migrateButton);

    await waitFor(() => {
      const call = (adminFetch as ReturnType<typeof vi.fn>).mock.calls.find(
        ([url]) => url === "/admin/content/migrate",
      );
      expect(call).toBeDefined();
    });
    expect(await screen.findByText(/Migration completed/)).toBeDefined();
  });

  it("validates against YAMLCharacterSchema before save", async () => {
    (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      YAML_RESPONSE as any,
    );
    render(<CharacterEditPage />);

    const nameInput = await screen.findByDisplayValue("Ada");
    fireEvent.change(nameInput, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/Validation failed/)).toBeDefined();
  });
});
