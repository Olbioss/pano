import { describe, expect, it } from "vitest";
import { shippedEmail } from "./templates";

const notice = {
  locale: "en" as const,
  title: "Dark mode",
  url: "https://pano.example/p/7-dark-mode",
  workspaceName: "Acme",
  note: null,
};

describe("shippedEmail", () => {
  it("names the post, links to it, and says how to stop", () => {
    const email = shippedEmail(notice);
    expect(email.subject).toBe("Shipped: Dark mode");
    expect(email.text).toContain("“Dark mode” on Acme's board has shipped.");
    expect(email.text).toContain(
      "See it on Pano: https://pano.example/p/7-dark-mode"
    );
    expect(email.text).toContain("press Unsubscribe");
    expect(email.html).toContain(
      '<a href="https://pano.example/p/7-dark-mode">'
    );
  });

  it("carries the team's note", () => {
    const email = shippedEmail({ ...notice, note: "In v2.\nEnjoy!" });
    expect(email.text).toContain("The team's note:\nIn v2.\nEnjoy!");
    expect(email.html).toContain("In v2.<br>Enjoy!");
  });

  it("escapes people's text in the HTML", () => {
    const email = shippedEmail({
      ...notice,
      title: '<img src=x onerror="alert(1)">',
      note: "a & b <script>",
    });
    expect(email.html).not.toContain("<img");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"
    );
    expect(email.html).toContain("a &amp; b &lt;script&gt;");
  });

  it("keeps the subject on one line", () => {
    expect(shippedEmail({ ...notice, title: "Dark\nmode" }).subject).toBe(
      "Shipped: Dark mode"
    );
  });

  it("writes Turkish for a Turkish workspace", () => {
    const email = shippedEmail({
      ...notice,
      locale: "tr",
      workspaceName: "Duman Kafe",
    });
    expect(email.subject).toBe("Yayında: Dark mode");
    expect(email.text).toContain(
      "Duman Kafe panosundaki “Dark mode” isteği yayına alındı."
    );
  });
});
