import type { Locale } from "@/shared/locale";

/**
 * What a code is for:
 * - `sign-in`: signs in, or creates an account (Sign in with a code)
 * - `confirm`: confirms a new password account's address
 * - `existing-account`: someone signed up with an address that already has
 *   an account; the code signs its owner in
 * - `reset`: sets a new password
 */
export const CODE_KINDS = [
  "sign-in",
  "confirm",
  "existing-account",
  "reset",
] as const;
export type CodeKind = (typeof CODE_KINDS)[number];

type CodeCopy = {
  subject: (code: string) => string;
  intro: string;
  expiry: string;
};

const copy = {
  en: {
    "sign-in": {
      subject: (code) => `${code} is your Pano sign-in code`,
      intro: "Use this code to sign in to Pano:",
      expiry:
        "It expires in 5 minutes. If you didn't ask for it, you can ignore this email.",
    },
    confirm: {
      subject: (code) => `${code} confirms your Pano account`,
      intro:
        "Use this code to confirm your email address and finish creating your Pano account:",
      expiry:
        "It expires in 5 minutes. If you didn't create a Pano account, you can ignore this email: nothing is set up until the code is entered.",
    },
    "existing-account": {
      subject: (code) => `${code} signs you in to Pano`,
      intro:
        "Someone tried to create a Pano account with this address, but you already have one. If it was you, use this code to sign in:",
      expiry:
        "It expires in 5 minutes. If it wasn't you, ignore this email: your account hasn't changed.",
    },
    reset: {
      subject: (code) => `${code} resets your Pano password`,
      intro: "Use this code to choose a new Pano password:",
      expiry:
        "It expires in 5 minutes. If you didn't ask for it, ignore this email: your password hasn't changed.",
    },
  },
  tr: {
    "sign-in": {
      subject: (code) => `Pano giriş kodunuz: ${code}`,
      intro: "Pano'ya giriş yapmak için bu kodu kullanın:",
      expiry:
        "Kod 5 dakika içinde geçersiz olur. Bu kodu siz istemediyseniz bu e-postayı yok sayabilirsiniz.",
    },
    confirm: {
      subject: (code) => `Pano hesabınızı onaylama kodu: ${code}`,
      intro:
        "E-posta adresinizi onaylayıp Pano hesabınızı oluşturmayı bitirmek için bu kodu kullanın:",
      expiry:
        "Kod 5 dakika içinde geçersiz olur. Pano hesabı oluşturmadıysanız bu e-postayı yok sayabilirsiniz: kod girilmeden hiçbir şey kurulmaz.",
    },
    "existing-account": {
      subject: (code) => `Pano'ya giriş kodunuz: ${code}`,
      intro:
        "Bu adresle bir Pano hesabı oluşturulmak istendi, ancak zaten bir hesabınız var. Siz istediyseniz giriş yapmak için bu kodu kullanın:",
      expiry:
        "Kod 5 dakika içinde geçersiz olur. Siz istemediyseniz bu e-postayı yok sayın: hesabınızda bir değişiklik olmadı.",
    },
    reset: {
      subject: (code) => `Pano şifre sıfırlama kodunuz: ${code}`,
      intro: "Yeni bir Pano şifresi belirlemek için bu kodu kullanın:",
      expiry:
        "Kod 5 dakika içinde geçersiz olur. Bunu siz istemediyseniz bu e-postayı yok sayın: şifreniz değişmedi.",
    },
  },
} satisfies Record<Locale, Record<CodeKind, CodeCopy>>;

/** A code email. The code is six digits, so it needs no escaping. */
export function codeEmail(kind: CodeKind, code: string, locale: Locale) {
  const c = copy[locale][kind];
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

/** An invitation to a workspace's team, for the invited address. */
export type InvitationNotice = {
  to: string;
  locale: Locale;
  /** Who's inviting: their display name, or the workspace's when they have none. */
  inviter: string;
  workspaceName: string;
  role: "admin" | "member";
  /** The invitation's page on Pano. */
  url: string;
  expiresAt: Date;
};

const invitationCopy = {
  en: {
    subject: (inviter: string, workspace: string) =>
      `${inviter} invited you to ${workspace} on Pano`,
    intro: (inviter: string, workspace: string, role: "admin" | "member") =>
      `${inviter} invited you to join ${workspace}'s team on Pano as ${role === "admin" ? "an admin" : "a member"}.`,
    link: "Join the team",
    expiry: (date: string) =>
      `The link works until ${date}. If you weren't expecting this, you can ignore it.`,
  },
  tr: {
    subject: (inviter: string, workspace: string) =>
      `${inviter} sizi Pano'da ${workspace} ekibine davet etti`,
    intro: (inviter: string, workspace: string, role: "admin" | "member") =>
      `${inviter} sizi Pano'da ${workspace} ekibine ${role === "admin" ? "yönetici" : "üye"} olarak katılmaya davet etti.`,
    link: "Ekibe katılın",
    expiry: (date: string) =>
      `Bağlantı ${date} tarihine kadar geçerli. Bu daveti beklemiyorsanız görmezden gelebilirsiniz.`,
  },
} satisfies Record<Locale, unknown>;

/** The email an invited address gets, in the workspace's language. */
export function invitationEmail(notice: Omit<InvitationNotice, "to">) {
  const c = invitationCopy[notice.locale];
  // Names are people's text; a subject is one line.
  const inviter = notice.inviter.replace(/\s+/g, " ");
  const workspace = notice.workspaceName.replace(/\s+/g, " ");
  const date = new Intl.DateTimeFormat(notice.locale, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(notice.expiresAt);
  const intro = c.intro(inviter, workspace, notice.role);
  const text = [intro, `${c.link}: ${notice.url}`, c.expiry(date)].join("\n\n");
  const html = [
    `<p>${escapeHtml(intro)}</p>`,
    `<p><a href="${escapeHtml(notice.url)}">${escapeHtml(c.link)}</a></p>`,
    `<p style="color:#666;font-size:12px">${escapeHtml(c.expiry(date))}</p>`,
  ].join("");
  return { subject: c.subject(inviter, workspace), text, html };
}
