import Link from "next/link";
import { requireStaffPage } from "@/lib/auth/session";
import { PageTitle } from "@/components/dashboard/ui";

export const metadata = { title: "Help & support" };

/* Studio guide for the business owner. Kept in the codebase so it always matches the
   features that are actually installed — update it whenever a feature changes. */

type Step = string | React.ReactNode;
function Steps({ items }: { items: Step[] }) {
  return <ol className="list-decimal space-y-2 pl-5 leading-relaxed marker:font-semibold marker:text-foreground/60">{items.map((s, i) => <li key={i}>{s}</li>)}</ol>;
}
function Bullets({ items }: { items: Step[] }) {
  return <ul className="list-disc space-y-1.5 pl-5 leading-relaxed">{items.map((s, i) => <li key={i}>{s}</li>)}</ul>;
}
function Go({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="font-medium text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground">{children}</Link>;
}
function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground">{children} ↗</a>;
}
function Table({ rows }: { rows: [React.ReactNode, React.ReactNode][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left"><tr><th className="px-3 py-2 font-medium">I want to…</th><th className="px-3 py-2 font-medium">Where</th></tr></thead>
        <tbody className="divide-y">{rows.map(([a, b], i) => <tr key={i}><td className="px-3 py-2 align-top">{a}</td><td className="px-3 py-2 align-top text-muted-foreground">{b}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

const SECTIONS: { id: string; title: string; body: React.ReactNode }[] = [
  {
    id: "start", title: "Getting started",
    body: <>
      <p>Your website, client records, bookings, masterclasses and payments are all managed here. Nothing needs a developer.</p>
      <Table rows={[
        ["Your website", <Ext key="1" href="/">adwoagyanwah.com</Ext>],
        ["Studio (this back office)", "adwoagyanwah.com/admin"],
        ["Client portal (your clients sign in here)", <Ext key="3" href="/portal">adwoagyanwah.com/portal</Ext>],
        ["Link-in-bio page for your social profiles", <Ext key="4" href="/links">adwoagyanwah.com/links</Ext>],
      ]} />
      <p className="font-medium">First sign-in</p>
      <Steps items={[
        "Open the one-time link you were given. It works once and expires after 60 minutes.",
        "Choose a password of at least 10 characters.",
        "Install an authenticator app on your phone (Google Authenticator, Microsoft Authenticator or 1Password) and scan the code Studio shows you.",
        "Save the 10 recovery codes somewhere safe, away from your phone. They let you in if you lose your phone.",
        <>Open <Go href="/admin/onboarding">Get started</Go>. It lists what is still missing and turns each step green by itself.</>,
      ]} />
    </>,
  },
  {
    id: "gmail", title: "Connect your Gmail (emails to clients)",
    body: <>
      <p>Booking confirmations, registrations, receipts, reminders and password resets are sent from your own Gmail address. It takes about two minutes. You never type your normal Gmail password into Studio — Google gives you a separate 16-letter code for this.</p>
      <Steps items={[
        <>Turn on <strong>2-Step Verification</strong> for your Google account: <Ext href="https://myaccount.google.com/signinoptions/twosv">open this page</Ext> and follow Google&apos;s steps (skip if it&apos;s already on).</>,
        <>Open <Ext href="https://myaccount.google.com/apppasswords">Google App Passwords</Ext>. Type a name such as <em>Website</em> and press <strong>Create</strong>.</>,
        "Google shows a 16-letter code in a yellow box. Copy it (spaces don't matter).",
        <>Here in Studio, open <Go href="/admin/settings/integrations#smtp">Integrations → Email</Go> and press <strong>Configure</strong>.</>,
        <>Under <strong>Connect Gmail</strong>, enter your Gmail address, the name clients should see (for example your business name), and paste the code. Press <strong>Connect Gmail</strong>.</>,
        <>When it says connected, press <strong>Send test email</strong> and check your inbox (and spam folder).</>,
      ]} />
      <Bullets items={[
        "Up to 200 automated emails go out in any 24 hours. Confirmations, receipts and password resets always go first; anything over the limit waits and sends automatically later.",
        "Newsletters are not sent from a personal Gmail account, to protect it from being flagged by Google.",
        <>If Google ever rejects the code (for example after you change your Google password), a task appears asking you to reconnect: create a new App Password and press <strong>Update credentials</strong>.</>,
        <><strong>Disconnect</strong> stops all email and removes the saved code.</>,
      ]} />
    </>,
  },
  {
    id: "paystack", title: "Connect Paystack (payments)",
    body: <>
      <p>Paystack takes Mobile Money and card payments. You start in <strong>test mode</strong>, where no real money moves. Live payments are switched on together with your technical administrator after a test payment and a refund have worked.</p>
      <Steps items={[
        <>Open <Ext href="https://dashboard.paystack.com/#/settings/developers">Paystack → Settings → API Keys &amp; Webhooks</Ext> and sign in.</>,
        <>In another tab open <Go href="/admin/settings/integrations#paystack">Integrations → Paystack</Go> and press <strong>Configure</strong>.</>,
        <>Copy the Paystack key starting <code>pk_test_</code> into <strong>Public key (test)</strong>, and the one starting <code>sk_test_</code> into <strong>Secret key (test)</strong>. Press <strong>Save</strong>.</>,
        <>Studio shows a <strong>Webhook URL</strong> and a <strong>Callback URL</strong> with copy buttons. Paste them into the matching boxes on the Paystack page and press <strong>Save changes</strong> there.</>,
        <>Back in Studio press <strong>Test connection</strong>. When the badge says <strong>Connected</strong>, press <strong>Enable</strong>.</>,
        "Tell your technical administrator it is ready. Together you make one small test purchase, check the receipt, refund it, and then switch to live.",
      ]} />
      <p className="text-muted-foreground">Studio may ask for your password again before payment changes — that is deliberate. Secret keys are never shown again after saving.</p>
    </>,
  },
  {
    id: "masterclasses", title: "Masterclasses and registration pop-ups",
    body: <>
      <Steps items={[
        <>Go to <Go href="/admin/events/quick">Masterclasses → Quick masterclass</Go> and fill in the short steps: title, date and time, online or in person, flyer, price (0 = free) and seats. Or use <Go href="/admin/events/new">New</Go> for every option (several hosts, a deadline, a certificate).</>,
        <>Press <strong>Preview</strong>, then <strong>Publish</strong>. <strong>Copy link</strong> to share it on LinkedIn or WhatsApp.</>,
        <>On the masterclass page find <strong>Website pop-up</strong> and press <strong>Turn on</strong>. The pop-up uses the flyer, date, price and countdown from the masterclass automatically.</>,
      ]} />
      <Bullets items={[
        <><strong>Selling seats on Selar (or another site)?</strong> Open the masterclass → <strong>Details</strong> → <strong>Register on another site</strong> and paste the link. The website&apos;s buttons and the pop-up then send people there. Clear it once Paystack is live so the website takes registrations itself.</>,
        "The pop-up hides itself when registration closes, seats sell out (or offers the waiting list), or the masterclass is cancelled, unpublished or over.",
        "It never appears in Studio, the client portal, checkout or booking pages, or on the masterclass's own page.",
        <>Registrations made on the website appear under the masterclass&apos;s <strong>Attendees</strong> tab, where you can check people in. (People who pay on Selar are recorded in Selar.)</>,
        <>To change a date after publishing use <strong>Manage → Reschedule</strong> so registered people are told automatically.</>,
      ]} />
    </>,
  },
  {
    id: "popups", title: "Other pop-ups and campaigns",
    body: <>
      <p>Open <Go href="/admin/website/popups">Pop-ups &amp; campaigns</Go> to promote coaching, a free resource, an offer, a course or your newsletter.</p>
      <Steps items={[
        "Pick a template.",
        "Write the heading, description and button text, choose where the button goes, and add a flyer or photo. Choose a layout and, if you like, colours.",
        "Choose where and when it shows: all pages, homepage only or chosen pages; desktop and/or mobile; delay; start and end dates; how often.",
        <>Check the desktop, tablet and mobile preview, press <strong>Save as draft</strong>, then <strong>Publish</strong>. <strong>Pause</strong> takes it off the website at any time.</>,
      ]} />
      <p className="text-muted-foreground">Only one pop-up shows at a time — the one with the highest <strong>priority</strong>. Visitors who close it don&apos;t see it again for the number of days you set.</p>
    </>,
  },
  {
    id: "clients", title: "Clients, bookings and availability",
    body: <>
      <p>Everyone who registers, books, enquires or subscribes becomes a contact automatically, with their whole history in one place.</p>
      <Table rows={[
        ["Find a client", <>The <strong>Search</strong> box at the top of the menu, or <Go key="c" href="/admin/crm">Contacts</Go></>],
        ["See a client's bookings, registrations, payments and notes", <><Go key="c" href="/admin/crm">Contacts</Go> → open the client</>],
        ["Follow leads from enquiry to paying client", <Go key="p" href="/admin/crm/pipeline">Pipeline</Go>],
        ["Ask for a testimonial", "Contacts → open the client → Send testimonial request"],
        ["Set the hours clients can book", <Go key="a" href="/admin/bookings/availability">Bookings → Availability</Go>],
        ["Let clients book a service directly, set its price", <><Go key="s" href="/admin/services">Services</Go> → open the service → Price, and Booking = Instant booking</>],
        ["Add, reschedule or cancel a booking, add a meeting link", <Go key="b" href="/admin/bookings">Bookings</Go>],
      ]} />
    </>,
  },
  {
    id: "money", title: "Payments, orders and finance",
    body: <Bullets items={[
      <><Go href="/admin/payments">Orders &amp; payments</Go> — every order and its status. Open one to see details or refund it.</>,
      <><Go href="/admin/finance">Finance</Go> — money in and out for any period, downloadable to Excel.</>,
      <><Go href="/admin/payments/reconciliation">Reconciliation</Go> — flags anything Paystack and your records disagree on.</>,
      "Paid tickets and bookings are confirmed only after Paystack confirms the payment. Receipts are emailed automatically once Gmail is connected.",
    ]} />,
  },
  {
    id: "website", title: "Editing your website and its design",
    body: <>
      <p>Everything you see on the website — words, photos, sections, colours, fonts and buttons — is changed here. Page changes save as a draft until you press <strong>Publish</strong>.</p>
      <Table rows={[
        ["Change words, photos or buttons on a page", <><Go key="w" href="/admin/website">Website</Go> → the page → Edit visually → Preview → Publish</>],
        ["Add, move or remove a section (services, masterclasses, gallery, testimonials, call to action…)", "In the page editor: drag sections from the left; select one to edit it"],
        ["Hide a section without deleting it", "Select the section → Hide this section"],
        ["Change a section's background", "Select the section → Section background: white, soft tint, deep feature or brand colour"],
        ["Change the big photo and credential badge at the top of the homepage", "Homepage editor → the first (Hero) section → Portrait, Credential fields"],
        ["Change colours and fonts everywhere at once", <><Go key="d" href="/admin/website/design">Website → Design</Go> → Colours &amp; typography</>],
        ["Logo, profile photo, link-sharing image", <><Go key="p" href="/admin/settings/profile">Business profile</Go> → Brand identity</>],
        ["Name, title, biography, expertise, recognition", <><Go key="p" href="/admin/settings/profile">Business profile</Go> → Personal &amp; professional</>],
        ["Phone, email, WhatsApp, address, social links", <><Go key="p" href="/admin/settings/profile">Business profile</Go> → Contact &amp; social</>],
        ["Menu, top banner, link-in-bio buttons", <Go key="n" href="/admin/website/navigation">Website → Navigation, banner &amp; links</Go>],
        ["Upload or crop photos", <><Go key="m" href="/admin/media">Media</Go> (click the important part of a photo to set its focus)</>],
        ["Privacy, Terms, Refund and Cancellation policies", "Business profile → Policies → Edit → Publish"],
        ["Write an article", <Go key="a" href="/admin/content/new">Content → New article</Go>],
      ]} />
      <p className="text-muted-foreground">The colours are a set that works together (white pages, soft blush sections, deep wine features, wine buttons, gold details). If you change one, check the preview so text stays easy to read. Only show genuine facts: testimonials need the client&apos;s permission, and credentials should be ones you can verify.</p>
    </>,
  },
  {
    id: "analytics", title: "Analytics",
    body: <Bullets items={[
      <><Go href="/admin">Dashboard</Go> — revenue, new leads, visitors, registrations, upcoming bookings and masterclasses; choose any date range.</>,
      <><Go href="/admin/analytics">Analytics</Go> — which pages people visit, where they come from (LinkedIn, Google, WhatsApp) and on which devices.</>,
      <><Go href="/admin/website/popups">Pop-ups &amp; campaigns</Go> — for each pop-up: views, clicks, closes, and the registrations, bookings, subscribers and payments that followed, with revenue.</>,
      <><Go href="/admin/marketing">Marketing</Go> — tracked links for LinkedIn posts, newsletter and campaigns.</>,
      "Only real visitors are counted: automated bots are filtered out and visits are measured without cookies (one person on two days counts twice).",
    ]} />,
  },
  {
    id: "security", title: "Security and good to know",
    body: <Bullets items={[
      <><strong>Connected</strong> on an integration means it has really been tested. Anything else means it isn&apos;t working yet.</>,
      <><Go href="/admin/activity">Activity</Go> and <Go href="/admin/tasks">Tasks</Go> show anything that needs attention — a failed payment, an email problem, a backup issue.</>,
      "Studio may ask for your password again before sensitive changes (payments, team, credentials).",
      "Lost your phone? Sign in with a recovery code. Lost those too? Your technical administrator can reset two-step sign-in.",
      <>Add a team member under <Go href="/admin/settings/users">Settings → Team &amp; roles</Go>; give each person only the role they need.</>,
      "Your website and records are backed up, encrypted, every night, and checked every five minutes.",
      <>Search engines are switched on at launch, once content and policies are final (<Go href="/admin/website/design">Website → Design</Go> → Search &amp; social).</>,
    ]} />,
  },
  {
    id: "help", title: "Getting help",
    body: <p>If something doesn&apos;t look right, check <Go href="/admin/activity">Activity</Go> first — most problems explain themselves there. For anything else, contact your technical administrator (the person who set up your website) and mention the page you were on and what you pressed.</p>,
  },
];

export default async function HelpPage() {
  await requireStaffPage("dashboard:view", "/admin/help");
  return (
    <div className="max-w-4xl space-y-8">
      <PageTitle title="Help & support" description="Your guide to running the website and Studio. Every link opens the right screen." />
      <nav aria-label="Guide contents" className="rounded-xl border p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contents</p>
        <ol className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {SECTIONS.map((s, i) => <li key={s.id}><a href={`#${s.id}`} className="hover:underline">{i + 1}. {s.title}</a></li>)}
        </ol>
      </nav>
      {SECTIONS.map((s, i) => (
        <section key={s.id} id={s.id} className="scroll-mt-20 space-y-4 rounded-xl border p-5 text-[0.95rem] sm:p-6">
          <h2 className="text-lg font-semibold">{i + 1}. {s.title}</h2>
          {s.body}
        </section>
      ))}
    </div>
  );
}
