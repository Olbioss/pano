import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, use } from "react";
import { useTranslations } from "use-intl";
import { meQueryOptions } from "@/lib/session";
import { isDemoEmail } from "@/shared/demo";

/**
 * True while a demo guest is on a real workspace's pages. The server refuses
 * everything they would write there (DEMO_ONLY), so the controls that write
 * are disabled instead of failing on every click.
 */
const GuestLock = createContext(false);

/** Whether this page's writing controls are locked for a demo guest. */
export const useGuestLocked = () => use(GuestLock);

/**
 * Locks the writing controls inside it when the signed-in account is a demo
 * guest and the workspace isn't the demo, and says why above them.
 */
export function GuestLockProvider({
  isDemo,
  children,
}: {
  isDemo: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("demo");
  const me = useQuery(meQueryOptions);
  const user = me.data?.user;
  const locked = Boolean(user && isDemoEmail(user.email) && !isDemo);
  return (
    <GuestLock value={locked}>
      {locked && (
        <p role="note" className="paper p-4 text-sm">
          {t("guestOnly")}
        </p>
      )}
      {children}
    </GuestLock>
  );
}
