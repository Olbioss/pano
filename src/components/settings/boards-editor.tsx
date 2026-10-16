import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { apiErrorKey, fieldErrorKey } from "@/lib/error-text";
import { move } from "@/lib/move";
import {
  createBoard,
  deleteBoard,
  renameBoard,
  reorderBoards,
  workspaceQueryOptions,
} from "@/lib/workspaces";
import { boardNameSchema } from "@/shared/schemas";

type Board = { id: string; slug: string; name: string; position: number };
type Callbacks = {
  onSuccess: () => Promise<void>;
  onError: (error: unknown) => void;
};

/** One translated line for a failed board request. */
function useBoardErrorText() {
  const tErrors = useTranslations("errors");
  const tFields = useTranslations("fieldErrors");
  return (error: unknown) => {
    const field =
      error instanceof ApiError && error.fields
        ? Object.values(error.fields)[0]
        : undefined;
    const key = field ? fieldErrorKey(field) : null;
    if (key) return tFields(key);
    return field ?? tErrors(apiErrorKey(error));
  };
}

export function BoardsEditor({
  slug,
  boards,
}: {
  slug: string;
  boards: Board[];
}) {
  const queryClient = useQueryClient();
  const errorText = useBoardErrorText();
  const [error, setError] = useState<string | null>(null);
  const callbacks: Callbacks = {
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({
        queryKey: workspaceQueryOptions(slug).queryKey,
      });
    },
    onError: (err) => setError(errorText(err)),
  };
  const reorder = useMutation({
    mutationFn: (ids: string[]) => reorderBoards(slug, ids),
    ...callbacks,
  });
  const ids = boards.map((board) => board.id);

  return (
    <div className="flex max-w-md flex-col gap-4">
      {boards.length > 0 && (
        <ul className="flex flex-col divide-y rounded-md border">
          {boards.map((board, index) => (
            <BoardRow
              key={board.id}
              slug={slug}
              board={board}
              canMoveUp={index > 0}
              canMoveDown={index < boards.length - 1}
              onMove={(offset) =>
                reorder.mutate(move(ids, index, index + offset))
              }
              {...callbacks}
            />
          ))}
        </ul>
      )}
      <AddBoardForm slug={slug} {...callbacks} />
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type RowProps = Callbacks & {
  slug: string;
  board: Board;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (offset: -1 | 1) => void;
};

function BoardRow({
  slug,
  board,
  canMoveUp,
  canMoveDown,
  onMove,
  onSuccess,
  onError,
}: RowProps) {
  const t = useTranslations("settings");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(board.name);
  const [confirming, setConfirming] = useState(false);
  const rename = useMutation({
    mutationFn: () => renameBoard(slug, board.id, name),
    onSuccess: async () => {
      setEditing(false);
      await onSuccess();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: () => deleteBoard(slug, board.id),
    onSuccess,
    onError,
  });

  if (editing) {
    return (
      <li className="flex items-center gap-2 p-2">
        <Label htmlFor={`rename-${board.id}`} className="sr-only">
          {t("renameLabel", { board: board.name })}
        </Label>
        <Input
          id={`rename-${board.id}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button
          size="sm"
          disabled={
            rename.isPending || !boardNameSchema.safeParse(name).success
          }
          onClick={() => rename.mutate()}
        >
          {t("save")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setEditing(false);
            setName(board.name);
          }}
        >
          {t("cancel")}
        </Button>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 p-2">
      <span className="flex-1">{board.name}</span>
      <Button
        size="sm"
        variant="ghost"
        aria-label={t("moveUp", { board: board.name })}
        disabled={!canMoveUp}
        onClick={() => onMove(-1)}
      >
        ↑
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label={t("moveDown", { board: board.name })}
        disabled={!canMoveDown}
        onClick={() => onMove(1)}
      >
        ↓
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
        {t("rename")}
      </Button>
      {confirming ? (
        <Button
          size="sm"
          variant="destructive"
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
        >
          {t("confirmDelete")}
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
          {t("delete")}
        </Button>
      )}
    </li>
  );
}

function AddBoardForm({
  slug,
  onSuccess,
  onError,
}: Callbacks & { slug: string }) {
  const t = useTranslations("settings");
  const [name, setName] = useState("");
  const add = useMutation({
    mutationFn: () => createBoard(slug, name),
    onSuccess: async () => {
      setName("");
      await onSuccess();
    },
    onError,
  });
  const valid = boardNameSchema.safeParse(name).success;

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) add.mutate();
      }}
    >
      <div className="flex flex-1 flex-col gap-2">
        <Label htmlFor="new-board">{t("newBoardLabel")}</Label>
        <Input
          id="new-board"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={!valid || add.isPending}>
        {t("addBoard")}
      </Button>
    </form>
  );
}
