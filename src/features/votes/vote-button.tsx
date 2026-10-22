import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronUp } from "lucide-react";
import { useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { useVote } from "./use-vote";

// A tally: the count in tabular figures, so it never shifts as it changes.
const SHAPE =
  "h-auto w-12 shrink-0 flex-col gap-0 rounded-sm py-1.5 font-semibold tabular-nums";

type Props = {
  postId: number;
  title: string;
  voted: boolean;
  voteCount: number;
};

/** The vote toggle. It stays enabled while requests run: they queue per post. */
export function VoteButton({ postId, title, voted, voteCount }: Props) {
  const t = useTranslations("vote");
  const vote = useVote(postId);
  return (
    <Button
      type="button"
      variant={voted ? "default" : "outline"}
      className={SHAPE}
      aria-pressed={voted}
      aria-label={t("voteFor", { title })}
      onClick={() => vote.mutate(!voted)}
    >
      <ChevronUp aria-hidden="true" />
      <span>{voteCount}</span>
    </Button>
  );
}

/** What signed-out visitors see instead: the count, linking to sign-in. */
export function SignInToVote({ voteCount }: { voteCount: number }) {
  const t = useTranslations("vote");
  const href = useRouterState({ select: (state) => state.location.href });
  return (
    <Button asChild variant="outline" className={SHAPE}>
      <Link
        to="/signin"
        search={{ redirect: href }}
        aria-label={t("signInToVote")}
        title={t("signInToVote")}
      >
        <ChevronUp aria-hidden="true" />
        <span>{voteCount}</span>
      </Link>
    </Button>
  );
}
