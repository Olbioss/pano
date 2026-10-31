import { describe, expect, it } from "vitest";
import { invitationEmail, shippedEmail } from "./templates";

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

describe("invitationEmail", () => {
  const invitation = {
    locale: "en" as const,
    inviter: "Defne",
    workspaceName: "Inkwell",
    role: "admin" as const,
    url: "https://pano.example/invite/abc123",
    expiresAt: new Date(Date.UTC(2026, 10, 6, 12)),
  };

  it("says who invites, to what, as what, and until when", () => {
    const email = invitationEmail(invitation);
    expect(email.subject).toBe("Defne invited you to Inkwell on Pano");
    expect(email.text).toContain(
      "Defne invited you to join Inkwell's team on Pano as an admin."
    );
    expect(email.text).toContain(
      "Join the team: https://pano.example/invite/abc123"
    );
    expect(email.text).toContain("The link works until November 6, 2026.");
    expect(email.html).toContain(
      '<a href="https://pano.example/invite/abc123">'
    );
  });

  it("writes Turkish for a Turkish workspace", () => {
    const email = invitationEmail({
      ...invitation,
      locale: "tr",
      role: "member",
    });
    expect(email.subject).toBe("Defne sizi Pano'da Inkwell ekibine davet etti");
    expect(email.text).toContain(
      "Defne sizi Pano'da Inkwell ekibine üye olarak katılmaya davet etti."
    );
    expect(email.text).toContain("6 Kasım 2026 tarihine kadar geçerli");
  });

  it("escapes names in the HTML and keeps the subject on one line", () => {
    const email = invitationEmail({
      ...invitation,
      inviter: "<b>Eve</b>\nTwo",
    });
    expect(email.subject).toBe("<b>Eve</b> Two invited you to Inkwell on Pano");
    expect(email.html).toContain("&lt;b&gt;Eve&lt;/b&gt; Two invited you");
    expect(email.html).not.toContain("<b>Eve</b>");
  });
});
