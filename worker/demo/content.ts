import type { PostStatus } from "@/shared/status";

/**
 * What the demo workspace holds after every reset: Inkwell, a made-up notes
 * app, with a roadmap in motion. Ages are counted back from the reset, so
 * the board always looks lived-in and Shipped always shows the last month.
 */

export type DemoPerson = { key: string; name: string };

/** The workspace's own team; their comments carry the Team badge. */
export const DEMO_TEAM: DemoPerson[] = [
  { key: "defne", name: "Defne Aksoy" },
  { key: "jonas", name: "Jonas Weber" },
];

/** People who post, vote and comment. Votes go to them in this order. */
export const DEMO_PEOPLE: DemoPerson[] = [
  { key: "ayse", name: "Ayşe Demir" },
  { key: "sarah", name: "Sarah Chen" },
  { key: "mehmet", name: "Mehmet Kaya" },
  { key: "lukas", name: "Lukas Becker" },
  { key: "elif", name: "Elif Şahin" },
  { key: "priya", name: "Priya Raman" },
  { key: "can", name: "Can Öztürk" },
  { key: "tomas", name: "Tomás García" },
  { key: "zeynep", name: "Zeynep Arslan" },
  { key: "kenji", name: "Kenji Ito" },
  { key: "burak", name: "Burak Aydın" },
  { key: "mia", name: "Mia Novak" },
  { key: "aylin", name: "Aylin Yıldız" },
  { key: "omar", name: "Omar Haddad" },
  { key: "emre", name: "Emre Koç" },
  { key: "hannah", name: "Hannah Müller" },
  { key: "selin", name: "Selin Çelik" },
  { key: "diego", name: "Diego Silva" },
  { key: "mert", name: "Mert Polat" },
  { key: "noah", name: "Noah Williams" },
  { key: "kerem", name: "Kerem Tekin" },
  { key: "amara", name: "Amara Okafor" },
  { key: "deniz", name: "Deniz Uslu" },
  { key: "sofia", name: "Sofia Lindqvist" },
  { key: "arjun", name: "Arjun Mehta" },
  { key: "chloe", name: "Chloé Martin" },
  { key: "yuki", name: "Yuki Tanaka" },
  { key: "grace", name: "Grace Kim" },
  { key: "ivan", name: "Ivan Petrov" },
  { key: "fatima", name: "Fatima Zahra" },
  { key: "ben", name: "Ben Carter" },
  { key: "lena", name: "Lena Hoffmann" },
  { key: "marco", name: "Marco Bianchi" },
  { key: "nora", name: "Nora Andersen" },
  { key: "leo", name: "Leo Rossi" },
  { key: "mateo", name: "Mateo Fernández" },
];

export const DEMO_BOARDS = [
  { slug: "features", name: "Features" },
  { slug: "bugs", name: "Bugs" },
  { slug: "integrations", name: "Integrations" },
] as const;

export type DemoBoard = (typeof DEMO_BOARDS)[number]["slug"];

export type DemoComment = {
  by: string;
  /** Hours before the reset. Replies must be younger than their parent. */
  hoursAgo: number;
  body: string;
  replies?: DemoComment[];
  /** The team's pinned comment on this post. */
  pinned?: boolean;
};

export type DemoStatusChange = {
  to: PostStatus;
  daysAgo: number;
  by: string;
  note?: string;
};

export type DemoPost = {
  board: DemoBoard;
  title: string;
  body: string;
  by: string;
  daysAgo: number;
  /** Everyone who voted, the author included. */
  votes: number;
  /** How many of those votes came in the last week: Trending ranks by them. */
  recentVotes?: number;
  /** Oldest first; the last one is the post's status now. */
  timeline?: DemoStatusChange[];
  comments?: DemoComment[];
};

export const DEMO_POSTS: DemoPost[] = [
  {
    board: "features",
    title: "Dark mode",
    body: "Writing at night with a bright white screen is rough. A dark theme, ideally one that follows the system setting, would make Inkwell so much nicer after sunset.",
    by: "ayse",
    daysAgo: 58,
    votes: 31,
    recentVotes: 6,
    timeline: [
      {
        to: "under_review",
        daysAgo: 40,
        by: "jonas",
        note: "Lots of interest here. We're scoping it.",
      },
      {
        to: "planned",
        daysAgo: 12,
        by: "defne",
        note: "Planned for the next release. It will follow your system setting, with a manual override.",
      },
    ],
    comments: [
      {
        by: "defne",
        hoursAgo: 280,
        pinned: true,
        body: "**Update:** dark mode is planned for 2.6. It follows your system theme by default, and you can override it per device.",
      },
      {
        by: "sarah",
        hoursAgo: 1300,
        body: "Yes please. Even a dimmer background for the editor would help.",
        replies: [
          {
            by: "jonas",
            hoursAgo: 1250,
            body: "Noted! We're designing it so the editor, the sidebar and code blocks all switch together.",
            replies: [
              {
                by: "sarah",
                hoursAgo: 1240,
                body: "That's even better, thank you.",
              },
            ],
          },
        ],
      },
      {
        by: "kenji",
        hoursAgo: 700,
        body: "Would love a true black option for OLED screens.",
        replies: [
          {
            by: "defne",
            hoursAgo: 650,
            body: "Good call. We'll look at a true-black variant once the base theme ships.",
          },
        ],
      },
      {
        by: "mia",
        hoursAgo: 30,
        body: "Counting the days 🌙",
      },
    ],
  },
  {
    board: "features",
    title: "Export notebooks to PDF",
    body: "I need to send notes to people who don't use Inkwell. Exporting a note, or a whole notebook, as a clean PDF would cover it.",
    by: "lukas",
    daysAgo: 45,
    votes: 24,
    recentVotes: 5,
    timeline: [
      {
        to: "planned",
        daysAgo: 20,
        by: "defne",
        note: "We'll start with single notes, then whole notebooks.",
      },
      {
        to: "in_progress",
        daysAgo: 5,
        by: "jonas",
        note: "In progress: single-note export works on staging.",
      },
    ],
    comments: [
      {
        by: "lukas",
        hoursAgo: 900,
        body: "Please keep the code highlighting in the PDF!",
        replies: [
          {
            by: "jonas",
            hoursAgo: 880,
            body: "Code blocks keep their colors in the export. That's in the first version.",
          },
        ],
      },
      {
        by: "priya",
        hoursAgo: 400,
        body: "Page size options (A4 and Letter) would be great.",
      },
    ],
  },
  {
    board: "features",
    title: "Tables in the editor",
    body: "Simple tables for comparing things side by side. Markdown tables are fine, as long as I don't have to line up the pipes by hand.",
    by: "tomas",
    daysAgo: 33,
    votes: 19,
    recentVotes: 4,
    timeline: [
      {
        to: "under_review",
        daysAgo: 8,
        by: "jonas",
        note: "Looking into how tables would round-trip through Markdown export.",
      },
    ],
    comments: [
      {
        by: "zeynep",
        hoursAgo: 500,
        body: "Sorting by a column would be a dream, but even plain tables would do.",
      },
    ],
  },
  {
    board: "features",
    title: "Offline mode on mobile",
    body: "On the metro I lose connection all the time. Let me keep writing offline and sync when I'm back.",
    by: "can",
    daysAgo: 70,
    votes: 17,
    recentVotes: 1,
    timeline: [
      {
        to: "planned",
        daysAgo: 30,
        by: "defne",
        note: "Planned after the sync rewrite: the conflict fix comes first.",
      },
    ],
    comments: [
      {
        by: "can",
        hoursAgo: 1500,
        body: "Even read-only offline access would be a big step.",
        replies: [
          {
            by: "jonas",
            hoursAgo: 1450,
            body: "Read-only comes almost for free with the new sync engine, so that part will land first.",
          },
        ],
      },
    ],
  },
  {
    board: "features",
    title: "Keyboard shortcut cheat sheet",
    body: "There are lots of shortcuts, but I can never remember them. A cheat sheet I can open from anywhere would help.",
    by: "noah",
    daysAgo: 40,
    votes: 15,
    recentVotes: 3,
    timeline: [
      { to: "planned", daysAgo: 25, by: "defne" },
      {
        to: "shipped",
        daysAgo: 4,
        by: "defne",
        note: "Shipped in 2.5! Press `?` anywhere to open it.",
      },
    ],
    comments: [
      {
        by: "noah",
        hoursAgo: 80,
        body: "The `?` cheat sheet is perfect. Thank you!",
      },
    ],
  },
  {
    board: "features",
    title: "Daily notes template",
    body: "A button that creates today's note from a template: date as the title, a checklist, and a place for meeting notes.",
    by: "selin",
    daysAgo: 52,
    votes: 12,
    recentVotes: 1,
    timeline: [
      { to: "planned", daysAgo: 30, by: "defne" },
      { to: "in_progress", daysAgo: 21, by: "jonas" },
      {
        to: "shipped",
        daysAgo: 11,
        by: "jonas",
        note: "Shipped: Settings → Templates → Daily note.",
      },
    ],
  },
  {
    board: "features",
    title: "Tags with colors",
    body: "Let me give each tag a color so I can scan the sidebar at a glance.",
    by: "zeynep",
    daysAgo: 15,
    votes: 11,
    recentVotes: 8,
    comments: [
      {
        by: "zeynep",
        hoursAgo: 300,
        body: "Colors would make scanning the sidebar so much faster.",
      },
      {
        by: "omar",
        hoursAgo: 90,
        body: "+1, and maybe emoji tags too?",
      },
    ],
  },
  {
    board: "features",
    title: "Version history for notes",
    body: "I overwrote a paragraph last week and had no way to get it back. Keeping older versions of a note would be a lifesaver.",
    by: "hannah",
    daysAgo: 21,
    votes: 9,
    recentVotes: 2,
  },
  {
    board: "features",
    title: "Focus mode that hides everything but the text",
    body: "Hide the sidebar, the toolbar and everything else. Just me and the words.",
    by: "chloe",
    daysAgo: 64,
    votes: 14,
    timeline: [
      { to: "planned", daysAgo: 45, by: "defne" },
      {
        to: "shipped",
        daysAgo: 22,
        by: "defne",
        note: "Shipped in 2.4. Toggle it with ⌘⇧F.",
      },
    ],
  },
  {
    board: "features",
    title: "Handwriting on iPad with Apple Pencil",
    body: "I take notes by hand in meetings. Drawing and handwriting right inside a note would let me drop my paper notebook.",
    by: "mia",
    daysAgo: 80,
    votes: 8,
    timeline: [
      {
        to: "closed",
        daysAgo: 30,
        by: "defne",
        note: "Not something we can do well right now, so we're closing it to be honest about it. We'll revisit after the editor rewrite.",
      },
    ],
    comments: [
      {
        by: "mia",
        hoursAgo: 700,
        body: "A shame, but thanks for being upfront.",
      },
    ],
  },
  {
    board: "features",
    title: "Share a notebook with a read-only link",
    body: "I'd like to share a notebook with my team as a read-only page, without them needing an account.",
    by: "arjun",
    daysAgo: 26,
    votes: 7,
    recentVotes: 2,
    timeline: [{ to: "under_review", daysAgo: 6, by: "jonas" }],
  },
  {
    board: "features",
    title: "Pin notes to the top of a notebook",
    body: "Some notes I open every day. Pinning them above the rest would save a lot of scrolling.",
    by: "aylin",
    daysAgo: 36,
    votes: 10,
    recentVotes: 2,
    timeline: [
      { to: "planned", daysAgo: 14, by: "defne" },
      { to: "in_progress", daysAgo: 3, by: "jonas" },
    ],
  },
  {
    board: "features",
    title: "Word count goal per note",
    body: "A small progress bar towards a word count goal, for drafts and essays.",
    by: "lena",
    daysAgo: 3,
    votes: 4,
    recentVotes: 4,
  },
  {
    board: "features",
    title: "Night theme for late writing sessions",
    body: "Could the app have a darker theme for writing late at night? The white background hurts my eyes.",
    by: "marco",
    daysAgo: 6,
    votes: 3,
    recentVotes: 3,
  },
  {
    board: "features",
    title: "Custom fonts in the editor",
    body: "I'd love to write in a serif font. Even a choice of three or four fonts would be enough.",
    by: "sofia",
    daysAgo: 1,
    votes: 2,
    recentVotes: 2,
  },
  {
    board: "bugs",
    title: "Sync conflict duplicates a note after editing on two devices",
    body: "If I edit a note on my phone while offline and then on my laptop, I end up with two copies of the note, one with '(conflict)' in the title.",
    by: "mehmet",
    daysAgo: 9,
    votes: 13,
    recentVotes: 9,
    timeline: [
      {
        to: "in_progress",
        daysAgo: 2,
        by: "jonas",
        note: "Reproduced. A fix is in progress as part of the sync rewrite.",
      },
    ],
    comments: [
      {
        by: "mehmet",
        hoursAgo: 200,
        body: "It happens when my phone was offline for a while and then I edit on the laptop.",
        replies: [
          {
            by: "jonas",
            hoursAgo: 60,
            body: "Thanks, that matches what we see. You won't lose any text, but you may get a '(conflict)' copy until the fix ships.",
          },
        ],
      },
    ],
  },
  {
    board: "bugs",
    title: "Search misses words with Turkish characters",
    body: "Searching for 'isler' doesn't find notes containing 'işler'. Search should treat ş and s, ğ and g, ı and i the same.",
    by: "elif",
    daysAgo: 16,
    votes: 9,
    recentVotes: 3,
    timeline: [
      { to: "in_progress", daysAgo: 10, by: "jonas" },
      {
        to: "shipped",
        daysAgo: 6,
        by: "defne",
        note: "Fixed in 2.5.1: search now folds Turkish letters, so 'isler' finds 'işler'.",
      },
    ],
    comments: [
      {
        by: "elif",
        hoursAgo: 370,
        body: "Searching 'işler' finds nothing unless I type it exactly the way it was written.",
        replies: [
          {
            by: "defne",
            hoursAgo: 140,
            body: "Fixed in 2.5.1. Search now treats ş and s, ğ and g, ı and i as the same letter.",
            replies: [
              {
                by: "elif",
                hoursAgo: 120,
                body: "Works perfectly now, teşekkürler!",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    board: "bugs",
    title: "Images disappear from exported Markdown",
    body: "When I export a note with images to Markdown, the image links point to files that aren't in the export.",
    by: "ivan",
    daysAgo: 19,
    votes: 6,
    recentVotes: 1,
    timeline: [{ to: "planned", daysAgo: 9, by: "jonas" }],
  },
  {
    board: "bugs",
    title: "App freezes when pasting a very long table",
    body: "Pasting a table with a few hundred rows from a spreadsheet freezes the editor for about ten seconds.",
    by: "kerem",
    daysAgo: 12,
    votes: 5,
    recentVotes: 2,
    timeline: [{ to: "under_review", daysAgo: 4, by: "jonas" }],
  },
  {
    board: "bugs",
    title: "Checkboxes reset after reopening a note",
    body: "I tick items in a checklist, close the note, open it again, and some boxes are unticked.",
    by: "fatima",
    daysAgo: 2,
    votes: 3,
    recentVotes: 3,
  },
  {
    board: "bugs",
    title: "Typo in the welcome email",
    body: "The welcome email says 'notbooks' instead of 'notebooks'.",
    by: "ben",
    daysAgo: 28,
    votes: 1,
    timeline: [
      {
        to: "closed",
        daysAgo: 27,
        by: "jonas",
        note: "Fixed, thanks for spotting it!",
      },
    ],
  },
  {
    board: "integrations",
    title: "Google Calendar: link notes to events",
    body: "Open a calendar event and see the meeting notes that belong to it, or create them in one click.",
    by: "grace",
    daysAgo: 48,
    votes: 16,
    recentVotes: 2,
    timeline: [
      {
        to: "planned",
        daysAgo: 18,
        by: "defne",
        note: "Planned. We'll start with Google Calendar, then look at Outlook.",
      },
    ],
    comments: [
      {
        by: "grace",
        hoursAgo: 1000,
        body: "Meeting notes linked to their event would save me so much searching.",
      },
    ],
  },
  {
    board: "integrations",
    title: "Import from Notion",
    body: "I'd like to move my workspace over from Notion without copying pages by hand.",
    by: "diego",
    daysAgo: 66,
    votes: 18,
    timeline: [
      { to: "planned", daysAgo: 50, by: "defne" },
      { to: "in_progress", daysAgo: 35, by: "jonas" },
      {
        to: "shipped",
        daysAgo: 17,
        by: "defne",
        note: "Shipped! File → Import → Notion. Databases come in as tables.",
      },
    ],
    comments: [
      {
        by: "hannah",
        hoursAgo: 380,
        body: "Imported 400 pages without a single problem. Great job!",
      },
      {
        by: "diego",
        hoursAgo: 350,
        body: "Nested databases came in as tables. Nice.",
      },
    ],
  },
  {
    board: "integrations",
    title: "Obsidian-compatible vault export",
    body: "Export everything as a folder of Markdown files with front matter that Obsidian can open.",
    by: "arjun",
    daysAgo: 10,
    votes: 12,
    recentVotes: 9,
    comments: [
      {
        by: "arjun",
        hoursAgo: 230,
        body: "Being able to leave without losing anything is what makes me trust a notes app.",
      },
    ],
  },
  {
    board: "integrations",
    title: "Web clipper for Firefox",
    body: "The Chrome clipper is great, but I use Firefox every day.",
    by: "nora",
    daysAgo: 38,
    votes: 8,
    recentVotes: 1,
  },
  {
    board: "integrations",
    title: "Zapier integration",
    body: "Create notes from forms, emails and other apps through Zapier.",
    by: "omar",
    daysAgo: 30,
    votes: 6,
    timeline: [{ to: "under_review", daysAgo: 15, by: "defne" }],
  },
  {
    board: "integrations",
    title: "Readwise highlights sync",
    body: "Bring my Kindle and article highlights from Readwise into a notebook automatically.",
    by: "yuki",
    daysAgo: 27,
    votes: 7,
    recentVotes: 2,
    timeline: [
      { to: "planned", daysAgo: 13, by: "defne" },
      { to: "in_progress", daysAgo: 1, by: "jonas" },
    ],
  },
  {
    board: "integrations",
    title: "Slack: save a message as a note",
    body: "A message action in Slack that saves the message, with a link back, into my inbox notebook.",
    by: "leo",
    daysAgo: 8,
    votes: 4,
    recentVotes: 3,
  },
  {
    board: "integrations",
    title: "Embed GitHub issues in a note",
    body: "Paste a GitHub issue link and see its title and status inline.",
    by: "mateo",
    daysAgo: 4,
    votes: 2,
    recentVotes: 2,
  },
];
