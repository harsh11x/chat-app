const nodemailer = require('nodemailer');

// Create transporter
let transporter = null;

/**
 * Initialize email transporter
 */
function initializeTransporter() {
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('Email configuration not found. Email services will be disabled.');
    return null;
  }

  transporter = nodemailer.createTransporter({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_PORT === '465', // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false, // Allow self-signed certificates
    },
  });

  // Verify transporter configuration
  transporter.verify((error, success) => {
    if (error) {
      console.error('Email transporter verification failed:', error);
      transporter = null;
    } else {
      console.log('✅ Email service is ready');
    }
  });

  return transporter;
}

// Initialize transporter on module load
initializeTransporter();

/**
 * Send email
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text content
 * @param {string} options.html - HTML content
 * @param {string} options.from - Sender email (optional)
 * @returns {Promise<boolean>} Success status
 */
async function sendEmail({ to, subject, text, html, from }) {
  try {
    if (!transporter) {
      console.error('Email transporter not initialized');
      return false;
    }

    const mailOptions = {
      from: from || `"ChatApp" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully: ${info.messageId}`);
    
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

/**
 * Send welcome email to new users
 * @param {string} email - User email
 * @param {string} name - User name
 * @returns {Promise<boolean>} Success status
 */
async function sendWelcomeEmail(email, name) {
  const subject = 'Welcome to ChatApp!';
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to ChatApp!</h1>
      </div>
      
      <div style="padding: 40px; background: #f9f9f9;">
        <h2 style="color: #333; margin-bottom: 20px;">Hi ${name}! 👋</h2>
        
        <p style="color: #666; font-size: 16px; line-height: 1.6;">
          Thank you for joining ChatApp! We're excited to have you as part of our community.
        </p>
        
        <div style="background: white; border-radius: 8px; padding: 25px; margin: 25px 0; border-left: 4px solid #667eea;">
          <h3 style="color: #333; margin-top: 0;">Getting Started:</h3>
          <ul style="color: #666; line-height: 1.6;">
            <li>Complete your profile setup</li>
            <li>Add contacts by phone number</li>
            <li>Start chatting with friends and family</li>
            <li>Enjoy secure, real-time messaging</li>
          </ul>
        </div>
        
        <p style="color: #666; font-size: 16px; line-height: 1.6;">
          If you have any questions or need help, feel free to reach out to our support team.
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="#" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Get Started
          </a>
        </div>
        
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center;">
          <p style="color: #999; font-size: 14px;">
            Best regards,<br>
            The ChatApp Team
          </p>
        </div>
      </div>
    </div>
  `;

  const text = `
    Welcome to ChatApp!
    
    Hi ${name}!
    
    Thank you for joining ChatApp! We're excited to have you as part of our community.
    
    Getting Started:
    - Complete your profile setup
    - Add contacts by phone number
    - Start chatting with friends and family
    - Enjoy secure, real-time messaging
    
    If you have any questions or need help, feel free to reach out to our support team.
    
    Best regards,
    The ChatApp Team
  `;

  return await sendEmail({ to: email, subject, text, html });
}

/**
 * Send password reset email
 * @param {string} email - User email
 * @param {string} name - User name
 * @param {string} resetToken - Password reset token
 * @returns {Promise<boolean>} Success status
 */
async function sendPasswordResetEmail(email, name, resetToken) {
  const subject = 'Password Reset Request - ChatApp';
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">ChatApp</h1>
      </div>
      
      <div style="padding: 30px; background: #f9f9f9;">
        <h2 style="color: #333; margin-bottom: 20px;">Password Reset Request</h2>
        
        <p style="color: #666; font-size: 16px; line-height: 1.5;">
          Hi ${name},
        </p>
        
        <p style="color: #666; font-size: 16px; line-height: 1.5;">
          We received a request to reset your password for your ChatApp account.
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
            Reset Password
          </a>
        </div>
        
        <p style="color: #666; font-size: 14px; line-height: 1.5;">
          If the button doesn't work, copy and paste this link into your browser:
          <br>
          <a href="${resetUrl}" style="color: #667eea; word-break: break-all;">${resetUrl}</a>
        </p>
        
        <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 15px; margin: 20px 0;">
          <p style="color: #856404; margin: 0; font-size: 14px;">
            <strong>Security Notice:</strong> This link will expire in 1 hour. If you didn't request this password reset, please ignore this email.
          </p>
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
          <p style="color: #999; font-size: 12px;">
            If you're having trouble with the link above, contact our support team.
          </p>
        </div>
      </div>
    </div>
  `;

  const text = `
    ChatApp - Password Reset Request
    
    Hi ${name},
    
    We received a request to reset your password for your ChatApp account.
    
    Click the link below to reset your password:
    ${resetUrl}
    
    This link will expire in 1 hour. If you didn't request this password reset, please ignore this email.
    
    If you're having trouble with the link above, contact our support team.
    
    Best regards,
    The ChatApp Team
  `;

  return await sendEmail({ to: email, subject, text, html });
}

/**
 * Send account verification email
 * @param {string} email - User email
 * @param {string} name - User name
 * @param {string} verificationToken - Verification token
 * @returns {Promise<boolean>} Success status
 */
async function sendVerificationEmail(email, name, verificationToken) {
  const subject = 'Verify Your Email - ChatApp';
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">ChatApp</h1>
      </div>
      
      <div style="padding: 30px; background: #f9f9f9;">
        <h2 style="color: #333; margin-bottom: 20px;">Verify Your Email Address</h2>
        
        <p style="color: #666; font-size: 16px; line-height: 1.5;">
          Hi ${name},
        </p>
        
        <p style="color: #666; font-size: 16px; line-height: 1.5;">
          Please verify your email address to complete your ChatApp account setup.
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
            Verify Email
          </a>
        </div>
        
        <p style="color: #666; font-size: 14px; line-height: 1.5;">
          If the button doesn't work, copy and paste this link into your browser:
          <br>
          <a href="${verificationUrl}" style="color: #667eea; word-break: break-all;">${verificationUrl}</a>
        </p>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
          <p style="color: #999; font-size: 12px;">
            If you didn't create a ChatApp account, please ignore this email.
          </p>
        </div>
      </div>
    </div>
  `;

  const text = `
    ChatApp - Verify Your Email Address
    
    Hi ${name},
    
    Please verify your email address to complete your ChatApp account setup.
    
    Click the link below to verify your email:
    ${verificationUrl}
    
    If you didn't create a ChatApp account, please ignore this email.
    
    Best regards,
    The ChatApp Team
  `;

  return await sendEmail({ to: email, subject, text, html });
}

/**
 * Send notification email
 * @param {string} email - User email
 * @param {string} name - User name
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @returns {Promise<boolean>} Success status
 */
async function sendNotificationEmail(email, name, title, message) {
  const subject = `ChatApp - ${title}`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">ChatApp</h1>
      </div>
      
      <div style="padding: 30px; background: #f9f9f9;">
        <h2 style="color: #333; margin-bottom: 20px;">${title}</h2>
        
        <p style="color: #666; font-size: 16px; line-height: 1.5;">
          Hi ${name},
        </p>
        
        <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0;">
            ${message}
          </p>
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
          <p style="color: #999; font-size: 12px;">
            Best regards,<br>
            The ChatApp Team
          </p>
        </div>
      </div>
    </div>
  `;

  const text = `
    ChatApp - ${title}
    
    Hi ${name},
    
    ${message}
    
    Best regards,
    The ChatApp Team
  `;

  return await sendEmail({ to: email, subject, text, html });
}

/**
 * Test email configuration
 * @returns {Promise<boolean>} Success status
 */
async function testEmailConfiguration() {
  try {
    if (!transporter) {
      console.error('Email transporter not initialized');
      return false;
    }

    await transporter.verify();
    console.log('Email configuration test passed');
    return true;
  } catch (error) {
    console.error('Email configuration test failed:', error);
    return false;
  }
}

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendNotificationEmail,
  testEmailConfiguration,
};