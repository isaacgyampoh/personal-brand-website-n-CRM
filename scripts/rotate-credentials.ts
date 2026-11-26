/**
 * Re-encrypts every stored integration credential with the ACTIVE master key
 * (the first entry of CREDENTIALS_MASTER_KEYS). Server shell only.
 *
 * Rotation procedure:
 *   1. Generate a new key: openssl rand -base64 32
 *   2. Prepend it with a higher version: CREDENTIALS_MASTER_KEYS="3:NEW,2:OLD"
 *   3. Restart web + worker, then run: pnpm credentials:rotate
 *   4. When it reports 0 remaining, remove the old key from the environment and restart.
 */
import { closePool, db } from "@/lib/database/pool";
import { rotateCredentialEncryption } from "@/lib/integrations/store";
import { activeKeyVersion } from "@/lib/security/vault";

async function main() {
  const n = await rotateCredentialEncryption(null);
  const left = await db.one<{ n: number }>("select count(*)::int as n from integration_configs where secrets_encrypted is not null and key_version <> $1", [activeKeyVersion()]);
  console.log(`Re-encrypted ${n} integration(s) with key v${activeKeyVersion()}. Remaining on older keys: ${left?.n ?? 0}.`);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => closePool());
