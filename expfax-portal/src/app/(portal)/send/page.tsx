import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { containers } from "@/lib/db/cosmos";
import { SendForm } from "@/components/fax/send-form";

export default async function SendFaxPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Fetch cover templates — only lightweight fields (no headerImage, which can be large)
  const templatesContainer = await containers.coverTemplates();
  const { resources: templates } = await templatesContainer.items
    .query({
      query: "SELECT c.id, c.templateName, c.bodyText, c.isDefault FROM c WHERE c.userId = @uid OR c.userId = null ORDER BY c.templateName",
      parameters: [{ name: "@uid", value: user.id }],
    })
    .fetchAll();

  // Build the list of accounts the user can send from
  const fromAccounts = user.faxbackAccounts?.length
    ? user.faxbackAccounts
    : user.faxbackAccountGuid
      ? [{ accountGuid: user.faxbackAccountGuid, accountId: user.faxbackAccountId ?? "", faxNumber: user.faxNumber ?? null, label: null, addedAt: "", addedBy: "" }]
      : [];

  return (
    <div>
      <h2 className="text-lg font-semibold mb-6">Send Fax</h2>
      <SendForm
        coverTemplates={templates}
        fromAccounts={fromAccounts}
        defaultAccountGuid={user.defaultFaxbackAccountGuid ?? user.faxbackAccountGuid}
      />
    </div>
  );
}
