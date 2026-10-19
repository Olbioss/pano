import { describe, expect, it, vi } from "vitest";
import { brevoMailer, consoleMailer, mailerFor, type SendFn } from "./mailer";

const accepted = async () => new Response("{}", { status: 201 });

describe("brevoMailer", () => {
  it("sends the code email through Brevo in the person's language", async () => {
    const send = vi.fn<SendFn>(accepted);
    await brevoMailer("key-123", "hello@pano.example", send).sendSignInCode({
      to: "ayse@example.com",
      code: "482913",
      locale: "tr",
    });

    expect(send).toHaveBeenCalledOnce();
    const [url, init] = send.mock.calls[0]!;
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("api-key")).toBe("key-123");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      sender: { name: "Pano", email: "hello@pano.example" },
      to: [{ email: "ayse@example.com" }],
      subject: "Pano giriş kodunuz: 482913",
    });
    expect(body.textContent).toContain("482913");
    expect(body.htmlContent).toContain("482913");
  });

  it("writes English when asked", async () => {
    const send = vi.fn<SendFn>(accepted);
    await brevoMailer("k", "hello@pano.example", send).sendSignInCode({
      to: "a@example.com",
      code: "111222",
      locale: "en",
    });
    const body = JSON.parse(String(send.mock.calls[0]![1].body));
    expect(body.subject).toBe("111222 is your Pano sign-in code");
  });

  it("sends a Shipped email through Brevo", async () => {
    const send = vi.fn<SendFn>(accepted);
    await brevoMailer("k", "hello@pano.example", send).sendShipped({
      to: "ayse@example.com",
      locale: "en",
      title: "Dark mode",
      url: "https://pano.example/p/7-dark-mode",
      workspaceName: "Acme",
      note: null,
    });
    const body = JSON.parse(String(send.mock.calls[0]![1].body));
    expect(body).toMatchObject({
      to: [{ email: "ayse@example.com" }],
      subject: "Shipped: Dark mode",
    });
    expect(body.textContent).toContain("https://pano.example/p/7-dark-mode");
  });

  it("fails when Brevo refuses the email", async () => {
    const send: SendFn = async () =>
      new Response('{"message":"unauthorized"}', { status: 401 });
    const mailer = brevoMailer("bad", "hello@pano.example", send);
    await expect(
      mailer.sendSignInCode({
        to: "a@example.com",
        code: "123456",
        locale: "en",
      })
    ).rejects.toThrow(/401/);
  });
});

describe("mailerFor", () => {
  it("prints codes locally when there's no Brevo key", () => {
    expect(mailerFor({})).toBe(consoleMailer);
  });

  it("refuses to run production without a Brevo key", () => {
    expect(() => mailerFor({ ENVIRONMENT: "production" })).toThrow(
      /BREVO_API_KEY/
    );
  });

  it("uses Brevo when a key is set", () => {
    const mailer = mailerFor({
      BREVO_API_KEY: "k",
      MAIL_FROM: "hello@pano.example",
    });
    expect(mailer).not.toBe(consoleMailer);
  });
});
