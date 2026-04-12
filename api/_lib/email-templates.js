import { escapeHtml } from './human-restore.js'

const esc = escapeHtml

/**
 * Shared email shell matching the delivery email design system.
 * Colors: bg #f5f0eb, card #ffffff, hero #211915, accent #9b6b3c,
 *         body text #4a3728, muted #9b8b7c, faint #bfb3a5
 * Fonts: Georgia serif for logo/hero, Arial for body
 */
export function emailShell({
  title = 'MemoryFix AI',
  heroTitle,
  heroSubtitle = '',
  bodyRows = '',
  footerRef = '',
  supportEmail = '',
}) {
  const subtitleRow = heroSubtitle
    ? `<table border="0" cellpadding="0" cellspacing="0" role="presentation"><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#c8b9a8;padding-top:10px" align="center">${esc(heroSubtitle)}</td></tr></table>`
    : ''

  const refRow = footerRef
    ? `Ref: ${esc(footerRef)}<br/>`
    : ''

  const supportRow = supportEmail
    ? `Questions? Contact <a href="mailto:${esc(supportEmail)}" style="color:#9b6b3c;text-decoration:underline">${esc(supportEmail)}</a><br/>`
    : ''

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${esc(title)}</title>
  <!--[if mso]><style>table,td{font-family:Arial,Helvetica,sans-serif!important}</style><![endif]-->
  <style>
    @media only screen and (max-width:620px){
      .email-wrapper{width:100%!important;padding:12px!important}
      .email-body{padding:28px 20px!important}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f5f0eb;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f5f0eb">
    <tr>
      <td align="center" style="padding:32px 16px">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" class="email-wrapper" style="max-width:600px;width:100%">

          <!-- LOGO -->
          <tr>
            <td align="center" style="padding:0 0 24px 0">
              <table border="0" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#211915;letter-spacing:-0.5px">
                    MemoryFix<span style="color:#9b6b3c"> AI</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- MAIN CARD -->
          <tr>
            <td>
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(33,25,21,0.06)">

                <!-- HERO -->
                <tr>
                  <td style="background:#211915;padding:32px 40px" align="center">
                    <table border="0" cellpadding="0" cellspacing="0" role="presentation"><tr><td style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:700;color:#ffffff;line-height:34px" align="center">${heroTitle}</td></tr></table>
                    ${subtitleRow}
                  </td>
                </tr>

                <!-- BODY -->
                <tr>
                  <td class="email-body" style="padding:32px 40px 12px 40px">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                      ${bodyRows}
                    </table>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="padding:24px 0 0 0" align="center">
              <table border="0" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#9b8b7c" align="center">
                    ${refRow}${supportRow}<span style="font-size:11px;color:#bfb3a5">&copy; ${new Date().getFullYear()} MemoryFix AI &middot; Privacy-first photo restoration</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function emailParagraph(text) {
  return `<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#4a3728;padding:0 0 20px 0">${text}</td></tr>`
}

export function emailDetailRow(label, value) {
  return `<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#4a3728;padding:0 0 6px 0"><strong style="color:#211915">${esc(label)}:</strong> ${esc(value)}</td></tr>`
}

export function emailDetailBlock(details) {
  const rows = details
    .map(([label, value]) => emailDetailRow(label, value))
    .join('')

  return `<tr><td style="padding:0 0 20px 0"><table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#faf8f5;border-radius:8px"><tr><td style="padding:16px 20px">${rows}</td></tr></table></td></tr>`
}

export function emailStepsList(steps) {
  const items = steps
    .map(
      (step, index) =>
        `<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#4a3728;padding:0 0 8px 0"><strong style="color:#9b6b3c">${index + 1}.</strong> ${esc(step)}</td></tr>`
    )
    .join('')

  return `<tr><td style="padding:0 0 20px 0"><table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">${items}</table></td></tr>`
}

export function emailCtaButton(url, label) {
  return `<tr><td align="center" style="padding:0 0 16px 0"><table border="0" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center" style="background:#211915;border-radius:8px"><a href="${esc(url)}" target="_blank" style="display:inline-block;padding:16px 40px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px">${esc(label)}</a></td></tr></table></td></tr>`
}

export function emailCtaFallback(url, label) {
  return `<tr><td align="center" style="padding:0 0 24px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9b8b7c">Button not working? <a href="${esc(url)}" style="color:#9b6b3c;text-decoration:underline">${esc(label)}</a></td></tr>`
}

export function emailInfoBox(text) {
  return `<tr><td style="padding:0 0 24px 0"><table border="0" cellpadding="0" cellspacing="0" width="100%" role="presentation" style="background:#faf8f5;border-radius:8px"><tr><td style="padding:14px 20px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#7a6c60" align="center">${text}</td></tr></table></td></tr>`
}

export function emailNoteBox(html) {
  return `<tr><td style="padding:0 0 24px 0"><table border="0" cellpadding="0" cellspacing="0" width="100%" role="presentation" style="background:#fffaf3;border:1px solid #e6d2b7;border-radius:8px"><tr><td style="padding:16px 20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#4a3728">${html}</td></tr></table></td></tr>`
}

export function emailSpacer() {
  return '<tr><td style="padding:0 0 8px 0"></td></tr>'
}
