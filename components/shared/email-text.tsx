/**
 * Renders an e-mail address so that CDN "email obfuscation" (Cloudflare) does
 * not rewrite it: the @ sits in its own element and mailto: is percent-encoded.
 * Server and browser output stay identical, so React hydration is unaffected.
 */
export function EmailText({ email }: { email: string }) {
  const at = email.indexOf("@");
  if (at < 0) return <>{email}</>;
  return <><span>{email.slice(0, at)}</span><span>@</span><span>{email.slice(at + 1)}</span></>;
}

export const mailtoHref = (email: string) => `mailto:${email.replace("@", "%40")}`;

export function EmailLink({ email, className }: { email: string; className?: string }) {
  return <a href={mailtoHref(email)} className={className}><EmailText email={email} /></a>;
}
