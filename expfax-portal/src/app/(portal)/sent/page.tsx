import { FaxList } from "@/components/fax/fax-list";
import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function SentPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const accounts = user.faxbackAccounts?.length
    ? user.faxbackAccounts.map((a) => ({ accountGuid: a.accountGuid, accountId: a.accountId, label: a.label }))
    : user.faxbackAccountGuid
      ? [{ accountGuid: user.faxbackAccountGuid, accountId: user.faxbackAccountId ?? "", label: null }]
      : [];

  return (
    <div>
      <h2 className="text-lg font-semibold mb-6">Sent Items</h2>
      <FaxList direction="sent" basePath="/sent" accounts={accounts} />
    </div>
  );
}
