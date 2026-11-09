import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SignUpPage } from "@/features/auth/sign-up-page";

export const Route = createFileRoute("/signup")({
  validateSearch: z.object({
    redirect: z.string().optional().catch(undefined),
  }),
  component: SignUp,
});

function SignUp() {
  const { redirect } = Route.useSearch();
  return <SignUpPage redirect={redirect} />;
}
