import { FaxList } from "@/components/fax/fax-list";

export default function InboxPage() {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-6">Inbox</h2>
      <FaxList direction="received" basePath="/inbox" />
    </div>
  );
}
