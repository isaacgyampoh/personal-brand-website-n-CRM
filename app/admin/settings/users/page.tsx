import { requireStaffPage } from "@/lib/auth/session";
import { db } from "@/lib/database/pool";
import { PERMISSIONS, ROLE_LABELS } from "@/lib/auth/permissions";
import { inviteStaffAction, rolePermissionsAction, updateStaffAction } from "@/features/settings/presentation/actions";
import { PageTitle, Panel, Table, Td, StatusBadge } from "@/components/dashboard/ui";
import { ActionButton, ActionForm, Field, Select, Submit } from "@/components/dashboard/forms";

export const metadata = { title: "Team & roles" };
const ROLE_OPTIONS = [["content_manager", "Content manager"], ["booking_manager", "Booking manager"], ["finance_manager", "Finance manager"], ["admin", "Administrator"]] as const;

export default async function UsersPage() {
  const me = await requireStaffPage("users:manage");
  const [staff, perms] = await Promise.all([
    db.query<{ id: string; email: string; full_name: string; role: string; status: string; last_login_at: Date | null }>("select id, email, full_name, role, status, last_login_at from users where role <> 'customer' order by role = 'owner' desc, created_at"),
    db.query<{ role: string; permission: string }>("select * from role_permissions"),
  ]);
  const has = (role: string, p: string) => perms.some((x) => x.role === role && x.permission === p);
  return (
    <div className="space-y-6">
      <PageTitle title="Team & roles" description="Every admin page and action checks permissions on the server." back={{ href: "/admin/settings", label: "Settings" }} />
      <Table head={["Person", "Role", "Status", "Last sign-in", ""]}>
        {staff.map((s) => (
          <tr key={s.id}>
            <Td><span className="font-medium">{s.full_name || s.email}</span><div className="text-xs text-muted-foreground">{s.email}</div></Td>
            <Td>{ROLE_LABELS[s.role as keyof typeof ROLE_LABELS]}</Td>
            <Td><StatusBadge status={s.status} /></Td>
            <Td className="text-xs">{s.last_login_at?.toLocaleString("en-GB") ?? "Never"}</Td>
            <Td>{s.role !== "owner" && s.id !== me.id && (
              <div className="flex flex-wrap gap-2">
                <ActionForm action={updateStaffAction} className="flex gap-1"><input type="hidden" name="id" value={s.id} /><input type="hidden" name="op" value="role" />
                  <select name="role" defaultValue={s.role} className="h-8 rounded border px-1 text-xs" aria-label="Role">{[...ROLE_OPTIONS, ["customer", "Remove staff access"] as const].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  <Submit variant="outline" className="h-8 text-xs">Update</Submit>
                </ActionForm>
                <ActionButton action={updateStaffAction} fields={{ id: s.id, op: s.status === "active" ? "suspend" : "activate" }} label={s.status === "active" ? "Suspend" : "Reactivate"} variant={s.status === "active" ? "destructive" : "outline"} />
              </div>
            )}</Td>
          </tr>
        ))}
      </Table>
      <Panel title="Invite a team member" description="They receive a single-use sign-in link by email.">
        <ActionForm action={inviteStaffAction} resetOnSuccess className="grid gap-3 sm:grid-cols-4">
          <Field label="Full name" name="fullName" required /><Field label="Email" name="email" type="email" required />
          <Select label="Role" name="role" options={ROLE_OPTIONS} /><div className="flex items-end"><Submit>Send invite</Submit></div>
        </ActionForm>
      </Panel>
      {me.role === "owner" && (
        <Panel title="Role permissions" description="Owner only. Customise what each role can do.">
          <div className="space-y-6">
            {(["admin", "content_manager", "booking_manager", "finance_manager"] as const).map((role) => (
              <ActionForm key={role} action={rolePermissionsAction} success={`${ROLE_LABELS[role]} updated`}>
                <input type="hidden" name="role" value={role} />
                <p className="mb-2 text-sm font-semibold">{ROLE_LABELS[role]}</p>
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4">
                  {PERMISSIONS.map((p) => <label key={p} className="flex items-center gap-2 text-xs"><input type="checkbox" name="permissions" value={p} defaultChecked={has(role, p)} /> {p}</label>)}
                </div>
                <Submit variant="outline" className="mt-2 h-8 text-xs">Save {ROLE_LABELS[role]}</Submit>
              </ActionForm>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
