import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import DistrictEditPage from "../[slug]/edit/page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: "industrial" }),
}));

const YAML_RESPONSE = {
  success: true,
  data: {
    path: "districts/industrial/district_industrial.yaml",
    yaml: { type: "district", slug: "industrial", name: "Industrial", weather: "smog" },
  },
};

vi.mock("@/lib/client-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/client-api")>("@/lib/client-api");
  return { ...actual, adminFetch: vi.fn() };
});

import { adminFetch } from "@/lib/client-api";

describe("DistrictEditPage", () => {
  beforeEach(() => {
    (adminFetch as ReturnType<typeof vi.fn>).mockReset();
  });

  it("exposes the weather field from YAML", async () => {
    (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(YAML_RESPONSE as any);
    render(<DistrictEditPage />);
    expect(await screen.findByDisplayValue("smog")).toBeDefined();
  });

  it("saves an edited weather value through the content file route", async () => {
    (adminFetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(YAML_RESPONSE as any)
      .mockResolvedValue({ success: true, data: {} } as any);
    render(<DistrictEditPage />);

    const input = await screen.findByDisplayValue("smog");
    fireEvent.change(input, { target: { value: "rain" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const call = (adminFetch as ReturnType<typeof vi.fn>).mock.calls.find(
        ([url, opts]) => typeof url === "string" && url.includes("/admin/content/file") && opts?.method === "PUT",
      );
      expect(call).toBeDefined();
      expect(String(call![1].body)).toContain("rain");
    });
  });

  it("rejects a district with an invalid slug before save", async () => {
    (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...YAML_RESPONSE,
      data: { ...YAML_RESPONSE.data, yaml: { ...YAML_RESPONSE.data.yaml, slug: "Bad Slug" } },
    } as any);
    render(<DistrictEditPage />);
    await screen.findByDisplayValue("smog");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/Validation failed/)).toBeDefined();
  });
});
