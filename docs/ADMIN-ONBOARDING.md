# Admin onboarding & account recovery

## 1. First administrator (server operator, once)

The first account is created from the server shell — there is no public "create admin" page.

```bash
cd /opt/brand-platform/deployment
docker compose --profile tools run --rm tools \
  npx tsx --tsconfig tsconfig.worker.json scripts/create-owner.ts --email owner@clientdomain.com --name "Client Name"
```

It prints a **single-use set-password link valid for 60 minutes**. Send it to the client over a trusted channel (or open it together). No password is ever typed into the shell, stored in env vars or logged.

## 2. Client's first sign-in

1. Open the link, choose a strong password (10+ characters; very common passwords, all-digit passwords and ones containing the email name are refused).
2. Sign in at `/login`. In production Studio immediately asks for **two-factor authentication** (Studio → Security): add the account to Google Authenticator / Microsoft Authenticator / 1Password / Authy (tap the setup link on the phone, or type the setup key shown — there is no QR code), then enter the 6-digit code.
3. **Save the 10 recovery codes** in a password manager. Each works once.
4. Follow **Studio → Get started**: every tick there is derived from real setup (MFA, brand details, SMTP, R2, Paystack test mode, first service, homepage, demo content removed).

## 3. Adding staff

Studio → Business settings → Team & roles (owner/admin, recent password confirmation required). Invited staff receive a sign-in link, then must enrol in MFA before they can use any Studio feature (until then they hold no permissions at all). Roles: Administrator, Content manager, Booking manager, Finance manager — permissions per role are editable by the owner.

## 4. Sensitive actions

Changing integration credentials, team members or role permissions, issuing refunds and recording offline payments require the password (and authenticator code) to have been confirmed in the last 15 minutes. Studio shows a confirmation box when needed.

## 5. Recovery

| Situation | What to do |
|---|---|
| Forgot password | "Forgot password?" on `/login` (emailed link, 60 minutes). All sessions are signed out on reset. |
| Lost phone, has recovery codes | Sign in, enter a recovery code instead of the 6-digit code; then Studio → Security → New recovery codes, and re-enrol later if needed. |
| Lost phone **and** codes | Server operator runs `... scripts/create-owner.ts --email <user> --reset-mfa` (signs out all sessions, logged in the audit trail). The user enrols again at next sign-in. |
| Owner email inaccessible | Operator re-runs `create-owner` with a new email (and updates the old account's role) after verifying identity out of band. |

## 6. Local development

`STAFF_MFA_REQUIRED` defaults to on in production and off in development/test; set it explicitly to override.
