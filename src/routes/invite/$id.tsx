import { createFileRoute } from "@tanstack/react-router";
import { InvitationPanel } from "@/features/invitations/invitation-panel";

// "invite" is a reserved workspace address, so this never shadows a board.
export const Route = createFileRoute("/invite/$id")({
  component: InvitePage,
});

function InvitePage() {
  const { id } = Route.useParams();
  return (
    <main className="paper mx-6 my-16 flex flex-col gap-4 p-6 sm:mx-auto sm:max-w-md sm:p-8">
      <InvitationPanel id={id} />
    </main>
  );
}
