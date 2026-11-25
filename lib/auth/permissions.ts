export const PERMISSIONS = [
  "dashboard:view", "website:edit", "website:publish", "content:edit", "content:publish", "media:manage",
  "crm:view", "crm:edit", "crm:import", "crm:export", "bookings:view", "bookings:manage", "events:view",
  "events:manage", "courses:manage", "products:manage", "payments:view", "payments:refund", "payments:record",
  "finance:export", "marketing:manage", "analytics:view", "settings:manage", "users:manage", "jobs:manage",
  "audit:view", "ai:use",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ["owner", "admin", "content_manager", "booking_manager", "finance_manager", "customer"] as const;
export type Role = (typeof ROLES)[number];

export const STAFF_ROLES: Role[] = ["owner", "admin", "content_manager", "booking_manager", "finance_manager"];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Business owner",
  admin: "Administrator",
  content_manager: "Content manager",
  booking_manager: "Booking manager",
  finance_manager: "Finance manager",
  customer: "Customer",
};

export function isStaffRole(role: string): role is Role {
  return STAFF_ROLES.includes(role as Role);
}
