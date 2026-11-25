import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { ProfileForms } from "@/components/portal/profile-forms";

export const metadata = { title: "Profile" };

export default async function Profile() {
  const user = await requireUser("/portal/profile");
  const u = await db.one<{ full_name: string; phone: string | null; timezone: string; notification_prefs: { sms?: boolean; marketing?: boolean }; deletion_requested_at: Date | null }>(
    "select full_name, phone, timezone, notification_prefs, deletion_requested_at from users where id = $1", [user.id]);
  return (
    <div className="max-w-2xl space-y-12">
      <h1 className="display-lg">Profile</h1>
      <ProfileForms email={user.email} profile={{ fullName: u!.full_name, phone: u!.phone ?? "", timezone: u!.timezone, sms: Boolean(u!.notification_prefs?.sms), marketing: Boolean(u!.notification_prefs?.marketing) }} deletionRequested={Boolean(u!.deletion_requested_at)} />
    </div>
  );
}
