import { requireUser } from "@/lib/auth/session";
import { myCertificates } from "@/features/portal/application/portal";

export const metadata = { title: "Certificates" };

export default async function Certificates() {
  const user = await requireUser("/portal/certificates");
  const certs = await myCertificates(user.id);
  return (
    <div className="space-y-8">
      <h1 className="display-lg">Certificates</h1>
      {certs.length ? (
        <ul className="grid gap-4 md:grid-cols-2">
          {certs.map((c) => (
            <li key={c.code} className="card-frame p-6">
              <p className="display-sm">{c.title}</p>
              <p className="mt-1 text-sm text-[var(--muted-ink)]">Issued {c.issued_at.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} · {c.code}</p>
              <div className="mt-5 flex gap-5"><a href={`/api/certificates/${c.code}`} className="btn btn-primary">Download PDF</a><a href={`/certificates/verify?code=${c.code}`} className="btn btn-link">Verification link</a></div>
            </li>
          ))}
        </ul>
      ) : <p className="text-[var(--muted-ink)]">Certificates appear here when you complete a course or attend an eligible masterclass.</p>}
    </div>
  );
}
