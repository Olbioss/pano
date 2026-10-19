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

/** A Shipped email, for one subscriber. */
export type ShippedNotice = {
  to: string;
  locale: Locale;
  title: string;
  /** The post's address on Pano. */
  url: string;
  workspaceName: string;
  /** The team's note on the status change, if any. */
  note: string | null;
};

/** Titles and notes are people's text: escaped before they go into HTML. */
function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const shippedCopy = {
  en: {
    subject: (title: string) => `Shipped: ${title}`,
    intro: (title: string, workspace: string) =>
      `Good news: “${title}” on ${workspace}'s board has shipped.`,
    note: "The team's note:",
    link: "See it on Pano",
    why: "You're getting this because you follow this request. To stop, open it and press Unsubscribe.",
  },
  tr: {
    subject: (title: string) => `Yayında: ${title}`,
    intro: (title: string, workspace: string) =>
      `Güzel haber: ${workspace} panosundaki “${title}” isteği yayına alındı.`,
    note: "Ekibin notu:",
    link: "Pano'da görün",
    why: "Bu isteği takip ettiğiniz için bu e-postayı alıyorsunuz. Durdurmak için isteği açıp “Abonelikten çık” düğmesine basın.",
  },
} satisfies Record<Locale, unknown>;

/** The email a subscriber gets when a post they follow ships. */
export function shippedEmail(notice: Omit<ShippedNotice, "to">) {
  const c = shippedCopy[notice.locale];
  // A subject is one line.
  const title = notice.title.replace(/\s+/g, " ");
  const intro = c.intro(title, notice.workspaceName);
  const text = [
    intro,
    ...(notice.note ? [`${c.note}\n${notice.note}`] : []),
    `${c.link}: ${notice.url}`,
    c.why,
  ].join("\n\n");
  const html = [
    `<p>${escapeHtml(intro)}</p>`,
    ...(notice.note
      ? [
          `<p>${escapeHtml(c.note)}<br>${escapeHtml(notice.note).replaceAll("\n", "<br>")}</p>`,
        ]
      : []),
    `<p><a href="${escapeHtml(notice.url)}">${escapeHtml(c.link)}</a></p>`,
    `<p style="color:#666;font-size:12px">${escapeHtml(c.why)}</p>`,
  ].join("");
  return { subject: c.subject(title), text, html };
}
