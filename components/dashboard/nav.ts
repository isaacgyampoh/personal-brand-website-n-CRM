import type { Permission } from "@/lib/auth/permissions";

export type NavItem = { href: string; label: string; icon: string; permission: Permission };
export type NavGroup = { label: string; items: NavItem[] };

export const ADMIN_NAV: NavGroup[] = [
  { label: "Overview", items: [
    { href: "/admin", label: "Dashboard", icon: "LayoutDashboard", permission: "dashboard:view" },
    { href: "/admin/activity", label: "Activity", icon: "Bell", permission: "dashboard:view" },
    { href: "/admin/search", label: "Search", icon: "Search", permission: "dashboard:view" },
    { href: "/admin/analytics", label: "Analytics", icon: "LineChart", permission: "analytics:view" },
  ] },
  { label: "Clients", items: [
    { href: "/admin/crm", label: "Contacts", icon: "Users", permission: "crm:view" },
    { href: "/admin/crm/pipeline", label: "Pipeline", icon: "Kanban", permission: "crm:view" },
    { href: "/admin/tasks", label: "Tasks", icon: "CheckSquare", permission: "crm:view" },
    { href: "/admin/partnerships", label: "Partnerships", icon: "Handshake", permission: "crm:view" },
  ] },
  { label: "Sell", items: [
    { href: "/admin/bookings", label: "Bookings", icon: "CalendarDays", permission: "bookings:view" },
    { href: "/admin/services", label: "Services", icon: "Briefcase", permission: "bookings:manage" },
    { href: "/admin/events", label: "Masterclasses", icon: "Presentation", permission: "events:view" },
    { href: "/admin/academy", label: "Academy", icon: "GraduationCap", permission: "courses:manage" },
    { href: "/admin/shop", label: "Shop", icon: "ShoppingBag", permission: "products:manage" },
    { href: "/admin/payments", label: "Orders & payments", icon: "Wallet", permission: "payments:view" },
    { href: "/admin/finance", label: "Finance", icon: "Receipt", permission: "payments:view" },
  ] },
  { label: "Publish", items: [
    { href: "/admin/website", label: "Website", icon: "Globe", permission: "website:edit" },
    { href: "/admin/content", label: "Content", icon: "PenLine", permission: "content:edit" },
    { href: "/admin/media", label: "Media", icon: "Images", permission: "media:manage" },
    { href: "/admin/proof", label: "Testimonials & press", icon: "Quote", permission: "content:edit" },
  ] },
  { label: "Grow", items: [
    { href: "/admin/marketing", label: "Marketing", icon: "Megaphone", permission: "marketing:manage" },
    { href: "/admin/assessments", label: "Assessments", icon: "ClipboardList", permission: "marketing:manage" },
    { href: "/admin/ai", label: "AI assistant", icon: "Sparkles", permission: "ai:use" },
  ] },
  { label: "System", items: [
    { href: "/admin/onboarding", label: "Get started", icon: "CheckSquare", permission: "settings:manage" },
    { href: "/admin/settings", label: "Business settings", icon: "Settings", permission: "settings:manage" },
    { href: "/admin/settings/integrations", label: "Integrations", icon: "Plug", permission: "settings:manage" },
    { href: "/admin/security", label: "Security", icon: "ShieldCheck", permission: "dashboard:view" },
    { href: "/admin/system", label: "Jobs & logs", icon: "Activity", permission: "jobs:manage" },
  ] },
];
