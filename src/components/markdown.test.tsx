// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Markdown } from "./markdown";

afterEach(cleanup);

describe("Markdown", () => {
  it("renders formatting and lists", () => {
    render(
      <Markdown>
        {"Please add **dark mode**:\n\n- at night\n- on mobile"}
      </Markdown>
    );
    expect(screen.getByText("dark mode").tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("drops raw HTML", () => {
    const { container } = render(
      <Markdown>
        {'Hi <img src="x" onerror="alert(1)"> <script>alert(2)</script>'}
      </Markdown>
    );
    expect(container.querySelector("img, script")).toBeNull();
  });

  it("empties javascript: links", () => {
    render(<Markdown>{"[click me](javascript:alert(1))"}</Markdown>);
    expect(screen.getByText("click me").getAttribute("href")).toBe("");
  });

  it("opens links in a new tab without passing authority or the address", () => {
    render(<Markdown>{"[docs](https://example.com)"}</Markdown>);
    const link = screen.getByRole("link", { name: "docs" });
    expect(link.getAttribute("rel")).toBe("nofollow ugc noopener noreferrer");
    expect(link.getAttribute("target")).toBe("_blank");
  });
});
