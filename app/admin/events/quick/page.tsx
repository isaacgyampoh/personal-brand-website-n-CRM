import { requireStaffPage } from "@/lib/auth/session";
import { loadSetting } from "@/features/settings/application/settings";
import { zoomAvailable } from "@/features/integrations/application/zoom";
import { googleConnected } from "@/features/integrations/application/google";
import { paymentsReady } from "@/features/payments/application/gateway";
import { PageTitle } from "@/components/dashboard/ui";
import { MasterclassWizard } from "@/components/dashboard/masterclass-wizard";

export const metadata = { title: "Quick masterclass" };
export const dynamic = "force-dynamic";

export default async function QuickMasterclass() {
  await requireStaffPage("events:manage", "/admin/events/quick");
  const [biz, zoom, google, ready] = await Promise.all([loadSetting("business"), zoomAvailable(), googleConnected(), paymentsReady()]);
  return (
    <div className="max-w-3xl">
      <PageTitle title="Create a masterclass" description={`Six quick steps. Times are in ${biz.timezone}.`} back={{ href: "/admin/events", label: "Masterclasses" }} />
      <MasterclassWizard currency={biz.currency} zoom={zoom} google={google} paymentsReady={ready} />
    </div>
  );
}
