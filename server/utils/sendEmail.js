import nodemailer from 'nodemailer';
import { google } from 'googleapis';

// Helper function to add timeout to promises
const withTimeout = (promise, timeoutMs) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Email operation timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
};

// Helper function to retry email sending
const retryOperation = async (operation, maxRetries = 3, delay = 2000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      console.log(`⚠️  Attempt ${attempt}/${maxRetries} failed: ${error.message}`);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Wait before retrying (exponential backoff)
      const waitTime = delay * attempt;
      console.log(`⏳ Retrying in ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
};

// Send email via Gmail API (OAuth2)
const sendViaGmail = async (options) => {
  try {
    if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET || 
        !process.env.GMAIL_REFRESH_TOKEN || !process.env.GMAIL_USER) {
      throw new Error('Gmail OAuth2 configuration missing (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, or GMAIL_USER)');
    }

    console.log('\n📧 Attempting Gmail API (OAuth2)');
    console.log('─'.repeat(50));
    console.log(`📬 To: ${options.email}`);
    console.log(`📝 Subject: ${options.subject}`);
    console.log(`👤 From: ${process.env.GMAIL_USER}`);

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      'https://developers.google.com/oauthplayground' // Redirect URL
    );

    // Set credentials
    oauth2Client.setCredentials({
      refresh_token: process.env.GMAIL_REFRESH_TOKEN
    });

    // Get access token
    const accessToken = await oauth2Client.getAccessToken();

    // Create transporter with OAuth2
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: process.env.GMAIL_USER,
        clientId: process.env.GMAIL_CLIENT_ID,
        clientSecret: process.env.GMAIL_CLIENT_SECRET,
        refreshToken: process.env.GMAIL_REFRESH_TOKEN,
        accessToken: accessToken.token
      }
    });

    const mailOptions = {
      from: `Savishkar 2025 <${process.env.GMAIL_USER}>`,
      to: options.email,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]*>/g, '')
    };

    const info = await retryOperation(
      async () => {
        return await withTimeout(
          transporter.sendMail(mailOptions),
          45000
        );
      },
      3,
      2000
    );
    
    console.log('✅ Email sent via Gmail API (OAuth2)!');
    console.log(`📨 Message ID: ${info.messageId}`);
    console.log(`📬 Delivered to: ${options.email}`);
    console.log('─'.repeat(50));
    
    return { messageId: info.messageId, service: 'gmail-oauth2' };
  } catch (error) {
    console.error(`❌ Gmail API failed: ${error.message}`);
    
    // Provide specific troubleshooting
    if (error.message.includes('invalid_grant') || error.message.includes('Token has been expired or revoked')) {
      console.error('\n💡 OAUTH2 TOKEN ERROR:');
      console.error('   • Refresh token has expired or been revoked');
      console.error('   • Generate a new refresh token from OAuth Playground');
      console.error('   • Visit: https://developers.google.com/oauthplayground');
    } else if (error.message.includes('invalid_client')) {
      console.error('\n💡 CLIENT CREDENTIALS ERROR:');
      console.error('   • Check GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET');
      console.error('   • Verify credentials in Google Cloud Console');
    } else if (error.message.includes('configuration missing')) {
      console.error('\n💡 CONFIGURATION ERROR:');
      console.error('   • Required: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET');
      console.error('   • Required: GMAIL_REFRESH_TOKEN, GMAIL_USER');
      console.error('   • See EMAIL_SETUP.md for setup instructions');
    }
    
    throw error;
  }
};

// Main email sending function
const sendEmail = async (options) => {
  const startTime = Date.now();
  
  try {
    console.log('\n📧 Email Send Request');
    console.log('─'.repeat(50));
    console.log(`🕐 Time: ${new Date().toISOString()}`);

    // Send via Gmail API (OAuth2)
    const result = await sendViaGmail(options);
    const duration = Date.now() - startTime;
    console.log(`⏱️  Total Duration: ${duration}ms`);
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('\n❌ Email Sending Failed');
    console.error('─'.repeat(50));
    console.error(`📬 To: ${options.email}`);
    console.error(`⏱️  Duration: ${duration}ms`);
    console.error(`❌ Error: ${error.message}`);
    console.error('─'.repeat(50));
    
    throw new Error(`Email delivery failed: ${error.message}`);
  }
};

export default sendEmail;
