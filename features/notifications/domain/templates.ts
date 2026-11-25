/**
 * Default transactional email templates. Editable in Admin → Settings → Emails
 * (DB overrides by key). Syntax: {{variable}} placeholders (HTML-escaped),
 * blank lines separate paragraphs, `[Label]({{url}})` renders a button.
 */
export type TemplateDef = { subject: string; body: string; description: string; marketing?: boolean };

export const DEFAULT_TEMPLATES: Record<string, TemplateDef> = {
  verify_email: {
    description: "Account email verification",
    subject: "Confirm your email address",
    body: "Hello,\n\nPlease confirm your email address to finish setting up your account.\n\n[Confirm email]({{verifyUrl}})\n\nThis link expires in 24 hours. If you didn't create an account, you can ignore this email.",
  },
  password_reset: {
    description: "Password reset link",
    subject: "Reset your password",
    body: "Hello,\n\nWe received a request to reset your password.\n\n[Choose a new password]({{resetUrl}})\n\nThis link expires in 60 minutes. If you didn't request this, no action is needed.",
  },
  magic_link: {
    description: "Passwordless sign-in / purchase claim link",
    subject: "Your secure sign-in link",
    body: "Hello,\n\nUse the button below to sign in and access your purchases.\n\n[Sign in securely]({{loginUrl}})\n\nThis link expires in 30 minutes and can be used once.",
  },
  booking_confirmed: {
    description: "Appointment confirmation",
    subject: "Confirmed: {{serviceName}} on {{when}}",
    body: "Hello {{name}},\n\nYour {{serviceName}} session is confirmed.\n\nWhen: {{when}}\nWhere: {{location}}\nReference: {{reference}}\n\n[Add to calendar]({{calendarUrl}})\n\n[Manage booking]({{manageUrl}})\n\n{{cancellationPolicy}}",
  },
  booking_cancelled: {
    description: "Appointment cancellation",
    subject: "Cancelled: {{serviceName}} on {{when}}",
    body: "Hello {{name}},\n\nYour {{serviceName}} session on {{when}} has been cancelled.\n\n{{refundNote}}\n\n[Book another time]({{bookUrl}})",
  },
  booking_rescheduled: {
    description: "Appointment rescheduled",
    subject: "Rescheduled: {{serviceName}} now on {{when}}",
    body: "Hello {{name}},\n\nYour {{serviceName}} session has been moved to {{when}}.\n\n[Add to calendar]({{calendarUrl}})\n\n[Manage booking]({{manageUrl}})",
  },
  appointment_reminder: {
    description: "Appointment reminder (24h / 1h)",
    subject: "Reminder: {{serviceName}} {{relative}}",
    body: "Hello {{name}},\n\nThis is a reminder of your {{serviceName}} session {{relative}} ({{when}}).\n\nWhere: {{location}}\n\n[View details]({{manageUrl}})",
  },
  appointment_follow_up: {
    description: "Post-appointment follow-up",
    subject: "Thank you for your session",
    body: "Hello {{name}},\n\nThank you for your {{serviceName}} session. I'd love to hear how it went.\n\n[Share feedback]({{feedbackUrl}})\n\n[Book your next session]({{bookUrl}})",
  },
  payment_receipt: {
    description: "Payment receipt",
    subject: "Receipt {{receiptNumber}} — {{total}}",
    body: "Hello {{name}},\n\nThank you for your payment of {{total}}.\n\nReceipt: {{receiptNumber}}\nOrder: {{reference}}\nItems: {{items}}\n\n[View receipt]({{receiptUrl}})",
  },
  event_registration_confirmed: {
    description: "Masterclass / event registration confirmation",
    subject: "You're registered: {{eventTitle}}",
    body: "Hello {{name}},\n\nYour place at {{eventTitle}} is confirmed.\n\nWhen: {{when}}\nFormat: {{format}}\nTicket: {{ticket}}\nReference: {{reference}}\n\n[Add to calendar]({{calendarUrl}})\n\n[Open your class page]({{portalUrl}})\n\nJoining details are available on your class page before the start time.",
  },
  event_reminder: {
    description: "Event reminder",
    subject: "Reminder: {{eventTitle}} {{relative}}",
    body: "Hello {{name}},\n\n{{eventTitle}} starts {{relative}} ({{when}}).\n\n[Open your class page]({{portalUrl}})",
  },
  event_cancelled: {
    description: "Event cancelled",
    subject: "Cancelled: {{eventTitle}}",
    body: "Hello {{name}},\n\nUnfortunately {{eventTitle}} scheduled for {{when}} has been cancelled.\n\n{{reason}}\n\n{{refundNote}}",
  },
  event_rescheduled: {
    description: "Event rescheduled",
    subject: "New date: {{eventTitle}}",
    body: "Hello {{name}},\n\n{{eventTitle}} has moved to {{when}}. Your registration remains valid.\n\n[Add to calendar]({{calendarUrl}})\n\n[Open your class page]({{portalUrl}})",
  },
  event_feedback_request: {
    description: "Post-event feedback request",
    subject: "How was {{eventTitle}}?",
    body: "Hello {{name}},\n\nThank you for attending {{eventTitle}}. Your feedback helps improve future sessions.\n\n[Share feedback]({{feedbackUrl}})",
  },
  waitlist_spot: {
    description: "Waitlist spot available",
    subject: "A place opened up: {{eventTitle}}",
    body: "Hello {{name}},\n\nA place has become available for {{eventTitle}}. Places are offered first come, first served.\n\n[Register now]({{eventUrl}})",
  },
  course_enrolled: {
    description: "Course enrolment",
    subject: "Welcome to {{courseTitle}}",
    body: "Hello {{name}},\n\nYou're enrolled in {{courseTitle}}.\n\n[Start learning]({{courseUrl}})",
  },
  product_access: {
    description: "Digital product access",
    subject: "Your download: {{productTitle}}",
    body: "Hello {{name}},\n\nThank you. {{productTitle}} is ready in your library.\n\n[Open your library]({{libraryUrl}})",
  },
  certificate_available: {
    description: "Certificate issued",
    subject: "Your certificate: {{title}}",
    body: "Congratulations {{name}},\n\nYour certificate for {{title}} is ready.\n\n[Download certificate]({{certificateUrl}})\n\nVerification code: {{code}}",
  },
  newsletter_confirm: {
    description: "Newsletter double opt-in",
    subject: "Please confirm your subscription",
    body: "Hello,\n\nPlease confirm that you'd like to receive the newsletter.\n\n[Confirm subscription]({{confirmUrl}})\n\nIf you didn't sign up, ignore this email and you won't be subscribed.",
  },
  campaign: {
    description: "Marketing campaign wrapper",
    subject: "{{subject}}",
    body: "{{content}}",
    marketing: true,
  },
  claim_purchase: {
    description: "Access purchases made at checkout",
    subject: "Access your purchase",
    body: "Hello {{name}},\n\nYour purchase is ready. Sign in with this secure link to access it in your portal.\n\n[Access my purchase]({{loginUrl}})",
  },
  testimonial_request: {
    description: "Request a testimonial",
    subject: "Would you share a few words?",
    body: "Hello {{name}},\n\nIf our work together helped you, would you consider sharing a short testimonial? You choose whether it can be published.\n\n[Share a testimonial]({{testimonialUrl}})",
    marketing: true,
  },
  abandoned_checkout: {
    description: "Checkout not completed (consented contacts only)",
    subject: "Your registration for {{itemName}} isn't complete",
    body: "Hello {{name}},\n\nYou started registering for {{itemName}} but didn't finish. If you'd still like to join, you can pick up where you left off.\n\n[Complete registration]({{resumeUrl}})",
    marketing: true,
  },
  admin_alert: {
    description: "Internal alert to the business owner",
    subject: "[Action needed] {{title}}",
    body: "{{message}}\n\n[Open dashboard]({{adminUrl}})",
  },
  task_reminder: {
    description: "Internal follow-up / publishing reminder",
    subject: "Reminder: {{title}}",
    body: "{{message}}\n\n[Open]({{url}})",
  },
};

const escapeMap: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => escapeMap[c]);

function substitute(template: string, data: Record<string, unknown>, escape: boolean): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k: string) => {
    const v = data[k];
    const s = v === undefined || v === null ? "" : String(v);
    return escape ? escapeHtml(s) : s;
  });
}

export type EmailBranding = { brandName: string; accent: string; ink: string; paper: string; footer: string };

/** Renders subject/text/html. Variables are always escaped in HTML output. */
export function renderEmail(
  def: { subject: string; body: string },
  data: Record<string, unknown>,
  brand: EmailBranding,
  extraFooterHtml = "",
): { subject: string; text: string; html: string } {
  const subject = substitute(def.subject, data, false).replace(/[\r\n]+/g, " ").slice(0, 250);
  const text = substitute(def.body, data, false).replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1: $2");

  const htmlBody = substitute(escapeHtml(def.body), data, true)
    .split(/\n{2,}/)
    .map((para) => {
      const button = /^\s*\[([^\]]+)\]\((\S+)\)\s*$/.exec(para);
      if (button) {
        const href = button[2].replace(/&amp;/g, "&");
        if (!/^https?:\/\//.test(href)) return "";
        return `<p style="margin:28px 0"><a href="${escapeHtml(href)}" style="background:${brand.accent};color:#fff;padding:13px 22px;text-decoration:none;display:inline-block;font-weight:600;letter-spacing:.02em">${button[1]}</a></p>`;
      }
      return `<p style="margin:0 0 16px;line-height:1.6">${para.replace(/\n/g, "<br>")}</p>`;
    })
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:${brand.paper};font-family:Georgia,'Times New Roman',serif;color:${brand.ink}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff" cellpadding="0" cellspacing="0">
<tr><td style="padding:28px 32px;border-bottom:1px solid #eee;font-size:20px;letter-spacing:.04em">${escapeHtml(brand.brandName)}</td></tr>
<tr><td style="padding:32px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px">${htmlBody}</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #eee;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:12px;color:#777">${escapeHtml(brand.footer)}${extraFooterHtml}</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}
