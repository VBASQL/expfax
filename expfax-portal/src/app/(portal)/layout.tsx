import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { validateSession } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { ToastProvider } from "@/components/toast-provider";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { valid, user, isAdmin } = await validateSession();

  if (!valid || !user) {
    redirect("/login");
  }

  // Strict admin enforcement: admins ONLY see /admin/*; non-admins NEVER do.
  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname") ?? "";
  const isAdminPath = pathname.startsWith("/admin");

  if (isAdmin && pathname && !isAdminPath) {
    redirect("/admin/invitations");
  }
  if (!isAdmin && isAdminPath) {
    redirect("/");
  }

  const isPending = !isAdmin && !user.faxbackAccountGuid;

  return (
    <AppShell
      user={{
        displayName: user.displayName,
        isAdmin,
        email: user.email,
      }}
      isPending={isPending}
      title="ExpFax Portal"
    >
      <ToastProvider />
      {children}
    </AppShell>
  );
}
