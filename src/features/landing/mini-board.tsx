import { cn } from "cn";
import { useTranslations } from "use-intl";
import type { RoadmapStatus } from "@/shared/status";

type Card = { title: string; votes: number; justShipped?: boolean };

// A few of the demo's real requests, as they sit on its roadmap.
const COLUMNS: { status: RoadmapStatus; cards: Card[] }[] = [
  {
    status: "planned",
    cards: [
      { title: "Dark mode", votes: 31 },
      { title: "Google Calendar: link notes to events", votes: 16 },
    ],
  },
  {
    status: "in_progress",
    cards: [
      { title: "Export notebooks to PDF", votes: 24 },
      { title: "Pin notes to the top of a notebook", votes: 10 },
    ],
  },
  {
    status: "shipped",
    cards: [
      { title: "Keyboard shortcut cheat sheet", votes: 15, justShipped: true },
      { title: "Import from Notion", votes: 18 },
    ],
  },
];

// Pinned by hand, so no two hang quite straight.
const TILT = ["-rotate-1", "rotate-[0.6deg]", "rotate-[-0.4deg]", "rotate-1"];

/**
 * The landing page's picture of Pano: a roadmap pinned to the board, where
 * a request gets stamped Shipped as the page opens. It's a picture, so
 * assistive tech skips it; the demo itself is one click away.
 */
export function MiniBoard() {
  const tStatuses = useTranslations("statuses");
  return (
    <div aria-hidden="true" className="grid grid-cols-3 gap-3 sm:gap-5">
      {COLUMNS.map((column, c) => (
        <div key={column.status} className="flex flex-col gap-4">
          <p className="font-heading font-semibold text-sm sm:text-base">
            {tStatuses(column.status)}
          </p>
          {column.cards.map((card, i) => (
            <div
              key={card.title}
              className={cn(
                "paper relative flex flex-col gap-3 p-2.5 pt-4 sm:p-4 sm:pt-5",
                TILT[(c * 2 + i) % TILT.length]
              )}
            >
              <span className="absolute -top-1.5 left-1/2 size-3 -translate-x-1/2 rounded-full bg-foreground shadow-[inset_-2px_-2px_0_rgb(0_0_0/0.25),0_2px_3px_rgb(0_0_0/0.25)]" />
              <p className="font-heading font-semibold text-xs leading-snug sm:text-[0.95rem]">
                {card.title}
              </p>
              <p className="self-start rounded-sm border px-1.5 font-semibold text-xs tabular-nums">
                {card.votes}
              </p>
              {card.justShipped && (
                <span className="motion-safe:animate-stamp absolute -rotate-[7deg] -top-3 -right-2 rounded-[3px] border-2 border-stamp-shipped bg-card/70 px-1.5 font-bold font-heading text-[0.7rem] text-stamp-shipped sm:top-auto sm:right-3 sm:bottom-3 sm:bg-transparent sm:text-sm">
                  {tStatuses("shipped")}
                </span>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
