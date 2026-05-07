import { FaxList } from "@/components/fax/fax-list";
import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function InboxPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const accounts = user.faxbackAccounts?.length
    ? user.faxbackAccounts.map((a) => ({ accountGuid: a.accountGuid, accountId: a.accountId, faxNumber: a.faxNumber, label: a.label }))
    : user.faxbackAccountGuid
      ? [{ accountGuid: user.faxbackAccountGuid, accountId: user.faxbackAccountId ?? "", faxNumber: null, label: null }]
      : [];

  return (
    <div>
      <h2 className="text-lg font-semibold mb-6">Inbox</h2>
      <FaxList direction="received" basePath="/inbox" accounts={accounts} />
    </div>
  );
}
