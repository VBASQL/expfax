import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { containers } from "@/lib/db/cosmos";
import { SendForm } from "@/components/fax/send-form";

export default async function SendFaxPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Fetch cover templates for this user + domain-level templates
  const templatesContainer = await containers.coverTemplates();
  const { resources: templates } = await templatesContainer.items
    .query({
      query: "SELECT c.id, c.templateName, c.isDefault FROM c WHERE c.userId = @uid OR c.userId = null",
      parameters: [{ name: "@uid", value: user.id }],
    })
    .fetchAll();

  return (
    <div>
      <h2 className="text-lg font-semibold mb-6">Send Fax</h2>
      <SendForm coverTemplates={templates} />
    </div>
  );
}
