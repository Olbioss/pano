import type { Locale } from "@/shared/locale";

const copy = {
  en: {
    subject: (code: string) => `${code} is your Pano sign-in code`,
    intro: "Use this code to sign in to Pano:",
    expiry:
      "It expires in 5 minutes. If you didn't ask for it, you can ignore this email.",
  },
  tr: {
    subject: (code: string) => `Pano giriş kodunuz: ${code}`,
    intro: "Pano'ya giriş yapmak için bu kodu kullanın:",
    expiry:
      "Kod 5 dakika içinde geçersiz olur. Bu kodu siz istemediyseniz bu e-postayı yok sayabilirsiniz.",
  },
} satisfies Record<Locale, unknown>;

/** The sign-in code email. The code is six digits, so it needs no escaping. */
export function signInCodeEmail(code: string, locale: Locale) {
  const c = copy[locale];
  return {
    subject: c.subject(code),
    text: `${c.intro}\n\n${code}\n\n${c.expiry}`,
    html: `<p>${c.intro}</p><p style="font-size:28px;font-weight:600;letter-spacing:4px">${code}</p><p>${c.expiry}</p>`,
  };
}
