import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ForgotPasswordPage } from "@/features/auth/forgot-password-page";

export const Route = createFileRoute("/forgot-password")({
  validateSearch: z.object({
    redirect: z.string().optional().catch(undefined),
  }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const { redirect } = Route.useSearch();
  return <ForgotPasswordPage redirect={redirect} />;
}
