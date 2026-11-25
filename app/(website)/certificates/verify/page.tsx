import type { Metadata } from "next";
import { verifyCertificate } from "@/features/academy/application/certificates";
import { formatDate } from "@/lib/time";

export const metadata: Metadata = { title: "Verify a certificate", robots: { index: false } };

export default async function VerifyCertificate({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const code = ((await searchParams).code ?? "").trim().toUpperCase();
  const c = code ? await verifyCertificate(code) : null;
  return (
    <div className="site-container max-w-2xl py-20">
      <p className="eyebrow eyebrow-rule">Certificate verification</p>
      <h1 className="display-lg mt-6">Verify a certificate</h1>
      <form className="mt-8 flex gap-2"><label htmlFor="code" className="sr-only">Certificate code</label><input id="code" name="code" defaultValue={code} placeholder="CERT-XXXX-XXXX-XXXX" className="field uppercase" /><button className="btn btn-primary">Verify</button></form>
      {code && (c && !c.revoked_at ? (
        <div className="card-frame mt-10 p-8" role="status">
          <p className="eyebrow text-green-800">Valid certificate</p>
          <p className="display-sm mt-3">{c.recipient_name}</p>
          <p className="mt-2">completed <strong>{c.title}</strong></p>
          <p className="mt-2 text-sm text-[var(--muted-ink)]">Issued {formatDate(c.issued_at, "Africa/Accra")}</p>
        </div>
      ) : <p className="mt-10 border-l-2 border-red-700 bg-red-50 px-4 py-3" role="alert">{c?.revoked_at ? "This certificate has been revoked." : "No certificate matches this code."}</p>)}
    </div>
  );
}
