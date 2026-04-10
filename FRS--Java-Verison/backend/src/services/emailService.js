import nodemailer from 'nodemailer';

// Create transporter (configured once, reused for all emails)
const transporter = nodemailer.createTransport({
  service: process.env.SMTP_SERVICE || 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

// Verify connection on startup
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Email service connection failed:', error.message);
  } else {
    console.log('✅ Email service ready');
  }
});

/**
 * Send enrollment invitation email to employee
 */
export async function sendEnrollmentInvitation({ employeeName, employeeEmail, enrollmentLink, expiresAt }) {
  const expiryDate = new Date(expiresAt).toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  });

  const mailOptions = {
    from: `"${process.env.SMTP_FROM_NAME || 'HR Team'}" <${process.env.SMTP_USER}>`,
    to: employeeEmail,
    subject: 'Complete Your Face Enrollment - Action Required',
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <!-- Header -->
    <tr>
      <td style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 30px 20px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Face Enrollment</h1>
        <p style="color: #cbd5e1; margin: 8px 0 0 0; font-size: 14px;">Attendance Management System</p>
      </td>
    </tr>
    
    <!-- Body -->
    <tr>
      <td style="padding: 40px 30px;">
        <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
          Hi <strong>${employeeName}</strong>,
        </p>
        
        <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
          You've been invited to complete your face enrollment for our attendance system.
        </p>
        
        <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 20px; margin: 25px 0;">
          <p style="color: #1e293b; font-size: 14px; font-weight: 600; margin: 0 0 12px 0;">📸 What you'll need:</p>
          <ul style="color: #475569; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px;">
            <li>A device with camera (phone or laptop)</li>
            <li>2-3 minutes in a well-lit area</li>
            <li>Remove glasses/mask temporarily</li>
          </ul>
        </div>
        
        <div style="background-color: #f8fafc; border-left: 4px solid #10b981; padding: 20px; margin: 25px 0;">
          <p style="color: #1e293b; font-size: 14px; font-weight: 600; margin: 0 0 12px 0;">🎯 The process:</p>
          <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0;">
            We'll guide you through capturing 5 photos from different angles:<br>
            <strong>Front, Left, Right, Up, Down</strong>
          </p>
          <p style="color: #64748b; font-size: 13px; line-height: 1.6; margin: 10px 0 0 0;">
            This takes about 2 minutes and ensures accurate recognition.
          </p>
        </div>
        
        <!-- CTA Button -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 35px 0;">
          <tr>
            <td align="center">
              <a href="${enrollmentLink}" 
                 style="display: inline-block; background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                Start Enrollment →
              </a>
            </td>
          </tr>
        </table>
        
        <!-- Expiry Notice -->
        <div style="background-color: #fef3c7; border: 1px solid #fcd34d; border-radius: 6px; padding: 15px; margin: 25px 0;">
          <p style="color: #92400e; font-size: 13px; margin: 0; text-align: center;">
            ⏰ This link expires on <strong>${expiryDate}</strong>
          </p>
        </div>
        
        <!-- Help -->
        <p style="color: #64748b; font-size: 13px; line-height: 1.6; margin: 25px 0 0 0;">
          <strong>Need help?</strong> Contact HR at 
          <a href="mailto:${process.env.SMTP_USER}" style="color: #3b82f6; text-decoration: none;">${process.env.SMTP_USER}</a>
        </p>
      </td>
    </tr>
    
    <!-- Footer -->
    <tr>
      <td style="background-color: #f8fafc; padding: 25px 30px; border-top: 1px solid #e2e8f0;">
        <p style="color: #64748b; font-size: 12px; line-height: 1.6; margin: 0; text-align: center;">
          This is an automated message. Please do not reply to this email.
        </p>
        <p style="color: #94a3b8; font-size: 11px; margin: 10px 0 0 0; text-align: center;">
          © 2026 Motivity Labs. All rights reserved.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    // Plain text fallback
    text: `
Hi ${employeeName},

You've been invited to complete your face enrollment for our attendance system.

What you'll need:
- A device with camera (phone or laptop)
- 2-3 minutes in a well-lit area
- Remove glasses/mask temporarily

The process:
We'll guide you through capturing 5 photos from different angles: Front, Left, Right, Up, Down.
This takes about 2 minutes and ensures accurate recognition.

Start Enrollment:
${enrollmentLink}

This link expires on ${expiryDate}.

Need help? Contact HR at ${process.env.SMTP_USER}

---
This is an automated message. Please do not reply to this email.
© 2026 Motivity Labs. All rights reserved.
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Enrollment email sent to ${employeeEmail} (Message ID: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Failed to send email to ${employeeEmail}:`, error.message);
    throw error;
  }
}

/**
 * Send enrollment completion notification to HR
 */
export async function sendEnrollmentCompleteNotification({ employeeName, employeeCode, averageQuality, hrEmail }) {
  const mailOptions = {
    from: `"${process.env.SMTP_FROM_NAME || 'HR Team'}" <${process.env.SMTP_USER}>`,
    to: hrEmail,
    subject: `Face Enrollment Completed - ${employeeName} (${employeeCode})`,
    html: `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #10b981;">✓ Enrollment Completed</h2>
  <p><strong>${employeeName}</strong> (${employeeCode}) has completed their face enrollment.</p>
  <p><strong>Average Quality:</strong> ${averageQuality}%</p>
  <p>Review and approve in the HR Dashboard → Remote Enrollment section.</p>
</body>
</html>
    `,
    text: `
Enrollment Completed

${employeeName} (${employeeCode}) has completed their face enrollment.
Average Quality: ${averageQuality}%

Review and approve in the HR Dashboard → Remote Enrollment section.
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Completion notification sent to ${hrEmail}`);
  } catch (error) {
    console.error(`❌ Failed to send notification to ${hrEmail}:`, error.message);
  }
}

/**
 * Send enrollment rejection notification with re-enrollment link
 */
export async function sendEnrollmentRejection({ employeeName, employeeEmail, reason, enrollmentLink }) {
  const mailOptions = {
    from: `"${process.env.SMTP_FROM_NAME || 'HR Team'}" <${process.env.SMTP_USER}>`,
    to: employeeEmail,
    subject: 'Action Required: Please Re-Submit Your Face Enrollment',
    html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .alert-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 5px; }
    .tips { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb; }
    .button { display: inline-block; background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
    .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 28px;">📸 Please Re-Submit Your Enrollment</h1>
    </div>
    <div class="content">
      <p style="font-size: 16px;">Hi <strong>${employeeName}</strong>,</p>
      <div class="alert-box">
        <p style="margin: 0; font-weight: 600; color: #92400e;">⚠️ Your previous enrollment submission was not approved</p>
        <p style="margin: 10px 0 0 0; color: #78350f;"><strong>Reason:</strong> ${reason}</p>
      </div>
      <p>Don't worry! You can re-submit your face enrollment photos at any time. We've prepared some tips to help you get better quality photos this time.</p>
      <div class="tips">
        <h3 style="margin-top: 0; color: #667eea;">📋 Tips for Better Photos:</h3>
        <ul style="margin: 10px 0; padding-left: 20px;">
          <li><strong>Good lighting:</strong> Face a window or light source, avoid backlighting</li>
          <li><strong>Remove accessories:</strong> Take off glasses, masks, hats temporarily</li>
          <li><strong>Neutral background:</strong> Stand against a plain wall if possible</li>
          <li><strong>Look directly at camera:</strong> Keep your face centered in the guide</li>
          <li><strong>Stay still:</strong> Hold steady for 1-2 seconds when capturing</li>
        </ul>
      </div>
      <p style="text-align: center;">
        <a href="${enrollmentLink}" class="button">🔄 Re-Submit Enrollment</a>
      </p>
      <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
        This link will remain active for 7 days. If you need assistance, please contact HR.
      </p>
    </div>
    <div class="footer">
      <p>This is an automated message from the HR Attendance System</p>
    </div>
  </div>
</body>
</html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Rejection email sent to ${employeeEmail}`);
  } catch (error) {
    console.error('❌ Failed to send rejection email:', error);
    throw error;
  }
}

export default { sendEnrollmentInvitation, sendEnrollmentCompleteNotification, sendEnrollmentRejection };
