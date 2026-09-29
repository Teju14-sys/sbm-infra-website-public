/* Apps Script for the SBM Infra "Enquiry Form" -> Google Sheets integration,
 * plus an auto-reply email to the enquirer (with brochure link) and a
 * notification email to the SBM team.
 *
 * Setup (one-time, in the browser — this cannot be automated from outside Google):
 * 1. Open the sheet: https://docs.google.com/spreadsheets/d/18ZJCMbKzKmtQUdnHzUFhvI8tH5gLU_O4B64-IiceXV4/edit
 * 2. Extensions > Apps Script.
 * 3. Delete any starter code, paste this file's contents in, save.
 * 4. Update SITE_BASE_URL below once the site has a real hosting domain
 *    (brochure links are built from it — they'll be broken until then).
 * 5. Deploy > New deployment > select type "Web app".
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 6. Click Deploy, authorize the requested permissions (it's your own script/sheet;
 *    it will also ask to send email as you, via GmailApp — that's expected).
 * 7. Copy the "Web app URL" it gives you.
 * 8. Paste that URL as the value of SBM_SHEET_ENDPOINT in contact.html.
 *
 * IMPORTANT: editing an *existing* deployment's version has proven unreliable
 * for this project — prefer Deploy > New deployment each time you change this
 * file, and update SBM_SHEET_ENDPOINT in contact.html with the new URL.
 */

var SITE_BASE_URL = 'https://sbm-infra-website.vercel.app';

var TEAM_NOTIFY_EMAIL = 'info@sbminfraprojects.in';

var PROJECT_BROCHURES = {
  'Sharanam Valley': 'sharanam-valley.pdf',
  'Green Meadows': 'green-meadows.pdf',
  'Capital Smart City': 'capital-smart-city.pdf',
  'High Rich County': 'high-rich-county.pdf',
  'Modern Premium County': 'modern-premium-county.pdf',
  'Prakruthi Hills': 'prakruthi-hills.pdf',
  'Urban Elite': 'urban-elite.pdf'
};

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var waLink = '';
  try {
    var ss = null;
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch(err) {}
    if (!ss) {
      ss = SpreadsheetApp.openById('18ZJCMbKzKmtQUdnHzUFhvI8tH5gLU_O4B64-IiceXV4');
    }
    var masterSheet = ss.getSheets()[0];

    // Rename default sheet to Worksheet if it is still Sheet1
    if (masterSheet.getName() === 'Sheet1') {
      masterSheet.setName('Worksheet');
    }

    var name = e.parameter.Name || '';
    var email = e.parameter.Email || '';
    var phone = e.parameter.Phone || '';
    var project = e.parameter.Project || 'Not sure / General enquiry';
    var message = e.parameter.Message || '';

    // Generate a pre-filled WhatsApp link so whoever picks up the lead can message the customer directly.
    waLink = getWhatsAppLink(phone, name, project);

    masterSheet.appendRow([new Date(), name, email, phone, message, project, waLink]);
  } finally {
    lock.releaseLock();
  }

  try {
    sendAutoReply(e.parameter);
  } catch (err) {
    // Sheet row is already saved; don't fail the request over email trouble.
    console.error('sendAutoReply failed for ' + (e.parameter.Email || 'unknown') + ': ' + err);
  }
  try {
    sendTeamNotification(e.parameter, waLink);
  } catch (err) {
    // Same — the enquiry is already captured in the Sheet regardless.
    console.error('sendTeamNotification failed for ' + (e.parameter.Email || 'unknown') + ': ' + err);
  }

  return ContentService.createTextOutput(JSON.stringify({ result: 'success' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function sendAutoReply(p) {
  var name = p.Name || 'there';
  var email = p.Email;
  if (!email) return;
  var project = p.Project || 'Not sure / General enquiry';

  var brochureUrl = null;
  if (PROJECT_BROCHURES[project]) {
    brochureUrl = SITE_BASE_URL + '/assets/brochures/' + PROJECT_BROCHURES[project];
  }

  var plainTextBrochureLine = '';
  if (brochureUrl) {
    plainTextBrochureLine = 'Brochure for ' + project + ':\n' + brochureUrl + '\n';
  } else {
    plainTextBrochureLine = 'View all our projects here: ' + SITE_BASE_URL + '/projects.html\n';
  }

  var plainTextBody =
    'Hi ' + name + ',\n\n' +
    'Thank you for your enquiry with SBM Infra Projects. We\'ve received your message and our team will be in touch with you shortly.\n\n' +
    plainTextBrochureLine + '\n' +
    'Regards,\n' +
    'SBM Infra Projects\n' +
    TEAM_NOTIFY_EMAIL;

  var htmlBody = getHtmlEmailTemplate(name, project, brochureUrl);

  GmailApp.sendEmail(email, 'Thank you for your enquiry — SBM Infra Projects', plainTextBody, {
    htmlBody: htmlBody
  });
}

function sendTeamNotification(p, waLink) {
  var waLine = waLink ? '\nContact via WhatsApp: ' + waLink : '';

  var plainTextBody =
    'New enquiry received via the website:\n\n' +
    'Name: ' + (p.Name || '') + '\n' +
    'Email: ' + (p.Email || '') + '\n' +
    'Phone: ' + (p.Phone || '') + '\n' +
    'Project: ' + (p.Project || 'Not sure / General enquiry') + '\n' +
    waLine + '\n' +
    'Message: ' + (p.Message || '') + '\n\n' +
    'Full log: https://docs.google.com/spreadsheets/d/18ZJCMbKzKmtQUdnHzUFhvI8tH5gLU_O4B64-IiceXV4/edit';

  var htmlBody = getHtmlTeamNotificationTemplate(p, waLink);

  GmailApp.sendEmail(TEAM_NOTIFY_EMAIL, 'New website enquiry: ' + (p.Name || 'Unknown'), plainTextBody, {
    htmlBody: htmlBody
  });
}

function getHtmlEmailTemplate(name, project, brochureUrl) {
  var ctaText = 'View All Projects';
  var ctaUrl = SITE_BASE_URL + '/projects.html';
  var ctaColor = '#0054A3';
  var brochureSection = '';

  if (brochureUrl) {
    ctaText = 'Download ' + project + ' Brochure';
    ctaUrl = brochureUrl;
    ctaColor = '#E84C09'; // SBM Accent Orange
    brochureSection =
      '<p style="color: #555555; font-size: 15px; line-height: 1.5; margin: 15px 0 5px 0;">' +
      'We have attached the brochure for <strong>' + project + '</strong> below for your convenience:' +
      '</p>';
  } else {
    brochureSection =
      '<p style="color: #555555; font-size: 15px; line-height: 1.5; margin: 15px 0 5px 0;">' +
      'Explore all our active layout developments, amenities, and locations on our website:' +
      '</p>';
  }

  var html =
    '<!DOCTYPE html>' +
    '<html>' +
    '<head>' +
    '  <meta charset="utf-8">' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '  <title>Thank you for your enquiry</title>' +
    '</head>' +
    '<body style="margin: 0; padding: 0; background-color: #FAF7F2; font-family: \'Helvetica Neue\', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1A1A18;">' +
    '  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #FAF7F2; padding: 40px 10px;">' +
    '    <tr>' +
    '      <td align="center">' +
    '        <!-- Main Card -->' +
    '        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; background-color: #FFFFFF; border-top: 4px solid #0054A3; border-radius: 8px; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05); overflow: hidden; text-align: left;">' +
    '          <!-- Header Logo -->' +
    '          <tr>' +
    '            <td style="padding: 35px 40px 15px 40px; text-align: center; border-bottom: 1px solid #EEEEEE;">' +
    '              <img src="' + SITE_BASE_URL + '/assets/images/logo.png" alt="SBM Infra Projects" style="height: 54px; width: auto; max-width: 100%; outline: none; border: none; display: block; margin: 0 auto;">' +
    '            </td>' +
    '          </tr>' +
    '          ' +
    '          <!-- Body Content -->' +
    '          <tr>' +
    '            <td style="padding: 40px 40px 30px 40px;">' +
    '              <h1 style="font-family: Georgia, serif; font-size: 24px; font-weight: normal; color: #0054A3; margin: 0 0 20px 0; line-height: 1.3;">' +
    '                Thank you for reaching out' +
    '              </h1>' +
    '              ' +
    '              <p style="font-size: 16px; line-height: 1.5; margin: 0 0 20px 0;">' +
    '                Hi ' + name + ',' +
    '              </p>' +
    '              ' +
    '              <p style="font-size: 15px; line-height: 1.5; margin: 0 0 20px 0; color: #333333;">' +
    '                We have received your enquiry submitted on our website regarding premium plotting developments. We are excited to help you find the perfect layout for your future investment or home. Our team at SBM Infra Projects will connect with you shortly.' +
    '              </p>' +
    '              ' +
    '              <!-- Brochure Download -->' +
    '              ' + brochureSection +
    '              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 15px 0 25px 0;">' +
    '                <tr>' +
    '                  <td align="center">' +
    '                    <a href="' + ctaUrl + '" target="_blank" style="display: inline-block; background-color: ' + ctaColor + '; color: #FFFFFF; font-size: 14px; font-weight: bold; text-decoration: none; padding: 12px 28px; border-radius: 4px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); border-bottom: 2px solid rgba(0,0,0,0.15); transition: background-color 0.2s;">' +
    '                      ' + ctaText + '' +
    '                    </a>' +
    '                  </td>' +
    '                </tr>' +
    '              </table>' +
    '              ' +
    '              <p style="font-size: 15px; line-height: 1.5; margin: 25px 0 0 0; color: #555555; border-top: 1px solid #EEEEEE; padding-top: 25px;">' +
    '                Best regards,<br>' +
    '                <strong style="color: #1A1A18;">SBM Infra Projects Team</strong>' +
    '              </p>' +
    '            </td>' +
    '          </tr>' +
    '          ' +
    '          <!-- Footer -->' +
    '          <tr>' +
    '            <td style="padding: 20px 40px; background-color: #F9F9F9; text-align: center; font-size: 12px; color: #777777; border-top: 1px solid #EEEEEE;">' +
    '              SBM Infra Projects • info@sbminfraprojects.in<br>' +
    '              This email was sent in response to your enquiry on our official website.' +
    '            </td>' +
    '          </tr>' +
    '        </table>' +
    '      </td>' +
    '    </tr>' +
    '  </table>' +
    '</body>' +
    '</html>';

  return html;
}

function getWhatsAppLink(phone, name, project) {
  if (!phone) return '';
  var cleanPhone = phone.toString().replace(/\D/g, '');
  if (cleanPhone.length === 10) {
    cleanPhone = '91' + cleanPhone;
  }
  var text = 'Hi ' + name + ', thank you for your interest in SBM\'s ' + project + '. A representative from our team will contact you shortly.';
  return 'https://wa.me/' + cleanPhone + '?text=' + encodeURIComponent(text);
}

function getHtmlTeamNotificationTemplate(p, waLink) {
  var whatsappButton = waLink ?
    '<table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0;">' +
    '  <tr>' +
    '    <td align="center">' +
    '      <a href="' + waLink + '" target="_blank" style="display: inline-block; background-color: #25D366; color: #FFFFFF; font-size: 15px; font-weight: bold; text-decoration: none; padding: 12px 30px; border-radius: 4px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); border-bottom: 2px solid #128C7E;">' +
    '        Chat on WhatsApp' +
    '      </a>' +
    '    </td>' +
    '  </tr>' +
    '</table>' : '';

  var html =
    '<!DOCTYPE html>' +
    '<html>' +
    '<head>' +
    '  <meta charset="utf-8">' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '  <title>New Website Enquiry</title>' +
    '</head>' +
    '<body style="margin: 0; padding: 0; background-color: #F4F4F1; font-family: Arial, sans-serif; color: #1A1A18;">' +
    '  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F4F4F1; padding: 30px 10px;">' +
    '    <tr>' +
    '      <td align="center">' +
    '        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; background-color: #FFFFFF; border-top: 4px solid #E84C09; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); text-align: left;">' +
    '          <tr>' +
    '            <td style="padding: 30px 40px 10px 40px;">' +
    '              <h2 style="margin: 0 0 15px 0; color: #E84C09; font-size: 20px;">New Website Lead</h2>' +
    '              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin-bottom: 20px;">' +
    '                <tr style="border-bottom: 1px solid #EEEEEE;"><td style="padding: 10px 0; font-weight: bold; width: 120px;">Name:</td><td style="padding: 10px 0;">' + (p.Name || 'N/A') + '</td></tr>' +
    '                <tr style="border-bottom: 1px solid #EEEEEE;"><td style="padding: 10px 0; font-weight: bold;">Email:</td><td style="padding: 10px 0;">' + (p.Email || 'N/A') + '</td></tr>' +
    '                <tr style="border-bottom: 1px solid #EEEEEE;"><td style="padding: 10px 0; font-weight: bold;">Phone:</td><td style="padding: 10px 0;">' + (p.Phone || 'N/A') + '</td></tr>' +
    '                <tr style="border-bottom: 1px solid #EEEEEE;"><td style="padding: 10px 0; font-weight: bold;">Project:</td><td style="padding: 10px 0;">' + (p.Project || 'N/A') + '</td></tr>' +
    '                <tr><td style="padding: 10px 0; font-weight: bold; vertical-align: top;">Message:</td><td style="padding: 10px 0; line-height: 1.4;">' + (p.Message || 'N/A') + '</td></tr>' +
    '              </table>' +
    '              ' + whatsappButton + ' ' +
    '            </td>' +
    '          </tr>' +
    '          <tr>' +
    '            <td style="padding: 20px 40px; background-color: #F9F9F9; text-align: center; font-size: 12px; color: #777777; border-top: 1px solid #EEEEEE; border-bottom-left-radius: 6px; border-bottom-right-radius: 6px;">' +
    '              <a href="https://docs.google.com/spreadsheets/d/18ZJCMbKzKmtQUdnHzUFhvI8tH5gLU_O4B64-IiceXV4/edit" target="_blank" style="color: #0054A3; text-decoration: none; font-weight: bold;">Open Google Sheet Database</a>' +
    '            </td>' +
    '          </tr>' +
    '        </table>' +
    '      </td>' +
    '    </tr>' +
    '  </table>' +
    '</body>' +
    '</html>';

  return html;
}
