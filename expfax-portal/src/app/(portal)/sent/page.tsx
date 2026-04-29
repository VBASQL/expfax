import { FaxList } from "@/components/fax/fax-list";

export default function SentPage() {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-6">Sent Items</h2>
      <FaxList direction="sent" basePath="/sent" />
    </div>
  );
}
