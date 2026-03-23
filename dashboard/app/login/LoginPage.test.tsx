import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, within, fireEvent } from "@testing-library/react";
import LoginPage from "./page";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders token input and submit button", () => {
    render(<LoginPage />);

    expect(screen.getByLabelText("Access Token")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign In" })).toBeInTheDocument();
    expect(screen.getByText("Open Control")).toBeInTheDocument();
    expect(screen.getByText("Enter your access token")).toBeInTheDocument();
  });

  it("redirects to dashboard on correct token", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    const { container } = render(<LoginPage />);
    const form = within(container);

    fireEvent.change(form.getByLabelText("Access Token"), {
      target: { value: "correct-token" },
    });
    fireEvent.click(form.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/");
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "correct-token" }),
    });
  });

  it("shows error message on incorrect token", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Invalid access token" }),
    } as Response);

    const { container } = render(<LoginPage />);
    const form = within(container);

    fireEvent.change(form.getByLabelText("Access Token"), {
      target: { value: "wrong-token" },
    });
    fireEvent.click(form.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(form.getByText("Invalid access token")).toBeInTheDocument();
    });

    expect(pushMock).not.toHaveBeenCalled();
  });

  it("shows loading state during submission", async () => {
    let resolvePromise: (value: Response) => void;
    vi.mocked(global.fetch).mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );

    const { container } = render(<LoginPage />);
    const form = within(container);

    fireEvent.change(form.getByLabelText("Access Token"), {
      target: { value: "test-token" },
    });
    fireEvent.click(form.getByRole("button", { name: "Sign In" }));

    expect(form.getByText("Authenticating...")).toBeInTheDocument();
    expect(form.getByRole("button")).toBeDisabled();

    resolvePromise!({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    await waitFor(() => {
      expect(form.getByText("Sign In")).toBeInTheDocument();
    });
  });
});
