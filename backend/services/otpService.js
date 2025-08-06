const twilio = require('twilio');

// Initialize Twilio client with error handling
let client = null;
try {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    console.log('✅ Twilio client initialized');
  } else {
    console.log('⚠️ Twilio credentials not provided - SMS features will be disabled');
  }
} catch (error) {
  console.error('❌ Failed to initialize Twilio client:', error.message);
}

/**
 * Send OTP via SMS using Twilio
 * @param {string} phoneNumber - Full phone number with country code
 * @param {string} otp - 6-digit OTP code
 * @returns {Promise<boolean>} - Success status
 */
const sendOTP = async (phoneNumber, otp) => {
  try {
    // In development or when Twilio is not configured, log OTP instead of sending SMS
    if (process.env.NODE_ENV === 'development' || !client) {
      console.log(`📱 OTP for ${phoneNumber}: ${otp}`);
      return true;
    }

    // Production SMS sending
    const message = await client.messages.create({
      body: `Your ChatApp verification code is: ${otp}\n\nThis code will expire in 5 minutes.\n\nDo not share this code with anyone.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber
    });

    console.log(`✅ SMS sent successfully: ${message.sid}`);
    return true;

  } catch (error) {
    console.error('❌ SMS sending failed:', error);
    
    // Log specific Twilio errors
    if (error.code) {
      console.error(`Twilio Error ${error.code}: ${error.message}`);
    }
    
    return false;
  }
};

/**
 * Send OTP via WhatsApp (optional)
 * @param {string} phoneNumber - Full phone number with country code
 * @param {string} otp - 6-digit OTP code
 * @returns {Promise<boolean>} - Success status
 */
const sendWhatsAppOTP = async (phoneNumber, otp) => {
  try {
    if (process.env.NODE_ENV === 'development' || !client) {
      console.log(`📱 WhatsApp OTP for ${phoneNumber}: ${otp}`);
      return true;
    }

    const message = await client.messages.create({
      body: `🔐 *ChatApp Verification*\n\nYour verification code is: *${otp}*\n\nThis code expires in 5 minutes.\nDo not share this code with anyone.`,
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${phoneNumber}`
    });

    console.log(`✅ WhatsApp message sent: ${message.sid}`);
    return true;

  } catch (error) {
    console.error('❌ WhatsApp sending failed:', error);
    return false;
  }
};

/**
 * Verify phone number format
 * @param {string} phoneNumber - Phone number to verify
 * @returns {boolean} - Is valid format
 */
const isValidPhoneNumber = (phoneNumber) => {
  // Basic phone number validation
  const phoneRegex = /^\+[1-9]\d{1,14}$/;
  return phoneRegex.test(phoneNumber);
};

/**
 * Get country info from phone number
 * @param {string} phoneNumber - Full phone number with country code
 * @returns {object} - Country information
 */
const getCountryInfo = (phoneNumber) => {
  const countryMappings = {
    '+1': { name: 'United States', code: 'US', flag: '🇺🇸' },
    '+91': { name: 'India', code: 'IN', flag: '🇮🇳' },
    '+44': { name: 'United Kingdom', code: 'GB', flag: '🇬🇧' },
    '+86': { name: 'China', code: 'CN', flag: '🇨🇳' },
    '+81': { name: 'Japan', code: 'JP', flag: '🇯🇵' },
    '+49': { name: 'Germany', code: 'DE', flag: '🇩🇪' },
    '+33': { name: 'France', code: 'FR', flag: '🇫🇷' },
    '+7': { name: 'Russia', code: 'RU', flag: '🇷🇺' },
    '+52': { name: 'Mexico', code: 'MX', flag: '🇲🇽' },
    '+55': { name: 'Brazil', code: 'BR', flag: '🇧🇷' },
    '+61': { name: 'Australia', code: 'AU', flag: '🇦🇺' },
    '+39': { name: 'Italy', code: 'IT', flag: '🇮🇹' },
    '+34': { name: 'Spain', code: 'ES', flag: '🇪🇸' },
    '+31': { name: 'Netherlands', code: 'NL', flag: '🇳🇱' },
    '+46': { name: 'Sweden', code: 'SE', flag: '🇸🇪' },
    '+47': { name: 'Norway', code: 'NO', flag: '🇳🇴' },
    '+45': { name: 'Denmark', code: 'DK', flag: '🇩🇰' },
    '+41': { name: 'Switzerland', code: 'CH', flag: '🇨🇭' },
    '+43': { name: 'Austria', code: 'AT', flag: '🇦🇹' },
    '+32': { name: 'Belgium', code: 'BE', flag: '🇧🇪' },
    '+82': { name: 'South Korea', code: 'KR', flag: '🇰🇷' },
    '+65': { name: 'Singapore', code: 'SG', flag: '🇸🇬' },
    '+60': { name: 'Malaysia', code: 'MY', flag: '🇲🇾' },
    '+66': { name: 'Thailand', code: 'TH', flag: '🇹🇭' },
    '+84': { name: 'Vietnam', code: 'VN', flag: '🇻🇳' },
    '+62': { name: 'Indonesia', code: 'ID', flag: '🇮🇩' },
    '+63': { name: 'Philippines', code: 'PH', flag: '🇵🇭' },
    '+92': { name: 'Pakistan', code: 'PK', flag: '🇵🇰' }
  };

  // Find matching country code
  for (const [code, info] of Object.entries(countryMappings)) {
    if (phoneNumber.startsWith(code)) {
      return { countryCode: code, ...info };
    }
  }

  return { 
    countryCode: 'Unknown', 
    name: 'Unknown', 
    code: 'XX', 
    flag: '🌍' 
  };
};

/**
 * Generate random OTP
 * @param {number} length - OTP length (default: 6)
 * @returns {string} - Generated OTP
 */
const generateOTP = (length = 6) => {
  const digits = '0123456789';
  let otp = '';
  
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * digits.length)];
  }
  
  return otp;
};

/**
 * Send OTP with fallback methods
 * @param {string} phoneNumber - Full phone number
 * @param {string} otp - OTP code
 * @param {string} method - Preferred method ('sms' or 'whatsapp')
 * @returns {Promise<object>} - Result with success status and method used
 */
const sendOTPWithFallback = async (phoneNumber, otp, method = 'sms') => {
  const result = {
    success: false,
    method: null,
    error: null
  };

  try {
    if (method === 'whatsapp') {
      // Try WhatsApp first
      const whatsappSuccess = await sendWhatsAppOTP(phoneNumber, otp);
      if (whatsappSuccess) {
        result.success = true;
        result.method = 'whatsapp';
        return result;
      }
    }

    // Try SMS (primary method or fallback)
    const smsSuccess = await sendOTP(phoneNumber, otp);
    if (smsSuccess) {
      result.success = true;
      result.method = 'sms';
      return result;
    }

    // If SMS fails and we haven't tried WhatsApp, try it
    if (method !== 'whatsapp') {
      const whatsappSuccess = await sendWhatsAppOTP(phoneNumber, otp);
      if (whatsappSuccess) {
        result.success = true;
        result.method = 'whatsapp';
        return result;
      }
    }

    result.error = 'All delivery methods failed';
    return result;

  } catch (error) {
    result.error = error.message;
    return result;
  }
};

module.exports = {
  sendOTP,
  sendWhatsAppOTP,
  sendOTPWithFallback,
  isValidPhoneNumber,
  getCountryInfo,
  generateOTP
};
