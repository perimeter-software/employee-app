import 'server-only';

/** Escape text for HTML email bodies (table cells, attributes-safe strings). */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function shiftDetailRowsHtml(
  rows: { label: string; value: string }[]
): string {
  const body = rows
    .map(
      (r, i) => `<tr>
<td style="padding:12px 16px;font-size:13px;font-weight:600;color:#475569;width:34%;vertical-align:top;border-bottom:${i < rows.length - 1 ? '1px solid #e2e8f0' : 'none'};">${escapeHtml(r.label)}</td>
<td style="padding:12px 16px;font-size:14px;color:#0f172a;vertical-align:top;border-bottom:${i < rows.length - 1 ? '1px solid #e2e8f0' : 'none'};">${escapeHtml(r.value)}</td>
</tr>`
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:22px 0;border-collapse:separate;border-spacing:0;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;overflow:hidden;">${body}</table>`;
}

/** Branded Employee App shell used by shift swap and event notification emails. */
export function wrapShiftEmailDocument(innerBodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background-color:#eef2f7;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#eef2f7;padding:28px 14px;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
<tr><td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:22px 26px;">
<p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:21px;color:#ffffff;font-weight:600;letter-spacing:0.02em;">Employee App</p>
<p style="margin:10px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:13px;color:rgba(255,255,255,0.88);line-height:1.4;">Scheduling &amp; shift updates</p>
</td></tr>
<tr><td style="padding:30px 26px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.65;color:#1e293b;">
${innerBodyHtml}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function emailGreetingName(displayName: string): string {
  const t = displayName.trim();
  return t || 'Colleague';
}

/** “Dear …,” line for employee-facing mail; empty string if no name. */
export function buildDearGreetingLine(displayName: string): string {
  const t = displayName.trim();
  if (!t) return '';
  const g = escapeHtml(emailGreetingName(t));
  return `<p style="margin:0 0 8px;font-size:18px;color:#0f172a;font-weight:600;">Dear ${g},</p>`;
}

/** Inner card body only (no outer wrap); used with DB template + fallback shell. */
export function buildSchedulingInnerHtml(options: {
  greetingHtml?: string;
  introHtml: string;
  detailRows: { label: string; value: string }[];
  closingHtml?: string;
}): string {
  const head = options.greetingHtml?.trim()
    ? `${options.greetingHtml.trim()}\n`
    : '';
  return `${head}${options.introHtml}
${shiftDetailRowsHtml(options.detailRows)}
${options.closingHtml ?? ''}`;
}

export function buildEmployeeShiftEmail(options: {
  greetingName: string;
  introHtml: string;
  detailRows: { label: string; value: string }[];
  closingHtml?: string;
}): string {
  const inner = buildSchedulingInnerHtml({
    greetingHtml: buildDearGreetingLine(options.greetingName),
    introHtml: options.introHtml,
    detailRows: options.detailRows,
    closingHtml: options.closingHtml,
  });
  return wrapShiftEmailDocument(inner);
}

export function buildEventAppEmail(options: {
  greetingName?: string;
  introHtml: string;
  detailRows: { label: string; value: string }[];
  closingHtml?: string;
}): string {
  const inner = buildSchedulingInnerHtml({
    greetingHtml: options.greetingName?.trim()
      ? buildDearGreetingLine(options.greetingName)
      : undefined,
    introHtml: options.introHtml,
    detailRows: options.detailRows,
    closingHtml: options.closingHtml,
  });
  return wrapShiftEmailDocument(inner);
}
