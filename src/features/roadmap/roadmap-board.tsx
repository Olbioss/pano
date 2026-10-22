import {
  type Announcements,
  type CollisionDetection,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  type UniqueIdentifier,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Link } from "@tanstack/react-router";
import { GripVertical } from "lucide-react";
import { useTranslations } from "use-intl";
import { useChangeStatus } from "@/features/status/use-change-status";
import { SignInToVote, VoteButton } from "@/features/votes/vote-button";
import { cn } from "@/lib/utils";
import type { PostSummary, Roadmap } from "@/shared/posts";
import {
  isRoadmapStatus,
  type PostStatus,
  ROADMAP_STATUSES,
  type RoadmapStatus,
} from "@/shared/status";
import { columnKeyboardCoordinates } from "./keyboard";

type Props = {
  workspace: string;
  roadmap: Roadmap;
  /** The team drags cards between columns; everyone else reads and votes. */
  isTeam: boolean;
  signedIn: boolean;
};

// The pointer's column when there is a pointer; the keyboard has none, and
// moves the card over a column instead.
const columnUnder: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args);
  return underPointer.length > 0 ? underPointer : rectIntersection(args);
};

const statusOf = (id: UniqueIdentifier | undefined) =>
  typeof id === "string" && isRoadmapStatus(id as PostStatus)
    ? (id as RoadmapStatus)
    : null;

/**
 * The public roadmap: planned, in progress, and recently shipped. The team
 * moves a request by dragging its card's handle to another column, with a
 * pointer or the keyboard; the move shows at once and rolls back with a
 * toast if it fails.
 */
export function RoadmapBoard({ workspace, roadmap, isTeam, signedIn }: Props) {
  const t = useTranslations("roadmap");
  const tStatuses = useTranslations("statuses");
  const move = useChangeStatus();
  const sensors = useSensors(
    // A few pixels of travel before a drag starts, so clicks still click.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnKeyboardCoordinates })
  );
  const find = (id: UniqueIdentifier) =>
    ROADMAP_STATUSES.flatMap((status) => roadmap[status]).find(
      (post) => post.id === id
    );
  const title = (id: UniqueIdentifier) => find(id)?.title ?? "";
  const column = (id: UniqueIdentifier | undefined) => {
    const status = statusOf(id);
    return status ? tStatuses(status) : "";
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => t("pickedUp", { title: title(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? t("over", { title: title(active.id), column: column(over.id) })
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? t("dropped", { title: title(active.id), column: column(over.id) })
        : t("stayed", { title: title(active.id) }),
    onDragCancel: ({ active }) => t("stayed", { title: title(active.id) }),
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={columnUnder}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t("instructions") },
      }}
      onDragEnd={({ active, over }) => {
        const post = find(active.id);
        const status = statusOf(over?.id);
        if (!post || !status || status === post.status) return;
        move.mutate({ post, workspace, status });
      }}
    >
      <div className="grid gap-4 md:grid-cols-3">
        {ROADMAP_STATUSES.map((status) => (
          <RoadmapColumn
            key={status}
            status={status}
            posts={roadmap[status]}
            isTeam={isTeam}
            signedIn={signedIn}
          />
        ))}
      </div>
    </DndContext>
  );
}

function RoadmapColumn({
  status,
  posts,
  isTeam,
  signedIn,
}: {
  status: RoadmapStatus;
  posts: PostSummary[];
  isTeam: boolean;
  signedIn: boolean;
}) {
  const t = useTranslations("roadmap");
  const tStatuses = useTranslations("statuses");
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    disabled: !isTeam,
  });
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={`roadmap-${status}`}
      data-roadmap-column={status}
      className={cn(
        // A lane taped off on the board; it lights up under a dragged card.
        "flex min-h-40 flex-col gap-3 rounded-md border-2 border-border border-dashed p-3",
        isOver && "border-ring bg-primary/5"
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={`roadmap-${status}`} className="font-bold text-lg">
          {tStatuses(status)}
        </h2>
        <span className="text-muted-foreground text-xs tabular-nums">
          {posts.length}
        </span>
      </div>
      {status === "shipped" && (
        <p className="-mt-2 text-muted-foreground text-xs">
          {t("shippedHint")}
        </p>
      )}
      {posts.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {posts.map((post) => (
            <RoadmapCard
              key={post.id}
              post={post}
              isTeam={isTeam}
              signedIn={signedIn}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function RoadmapCard({
  post,
  isTeam,
  signedIn,
}: {
  post: PostSummary;
  isTeam: boolean;
  signedIn: boolean;
}) {
  const t = useTranslations("roadmap");
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id: post.id, disabled: !isTeam });
  return (
    <li
      ref={setNodeRef}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
      className={cn(
        "paper flex items-start gap-3 p-3",
        isDragging && "relative z-10 rotate-1 shadow-lg"
      )}
    >
      {signedIn ? (
        <VoteButton
          postId={post.id}
          title={post.title}
          voted={post.voted}
          voteCount={post.voteCount}
        />
      ) : (
        <SignInToVote voteCount={post.voteCount} />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          to="/p/$ref"
          params={{ ref: post.ref }}
          className="font-heading font-semibold leading-snug hover:underline"
        >
          {post.title}
        </Link>
        <span className="text-muted-foreground text-xs">{post.board.name}</span>
      </div>
      {isTeam && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={t("move", { title: post.title })}
          className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        >
          <GripVertical aria-hidden="true" className="size-4" />
        </button>
      )}
    </li>
  );
}
