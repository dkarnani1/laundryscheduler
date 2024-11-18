// services/notificationService.js
import AWS from 'aws-sdk';

class NotificationService {
  constructor() {
    // Configure AWS SDK
    AWS.config.update({
      region: process.env.AWS_REGION,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    });
    
    this.sns = new AWS.SNS();
  }

  async sendSMS(phoneNumber, message) {
    const params = {
      Message: message,
      PhoneNumber: phoneNumber,
      MessageAttributes: {
        'AWS.SNS.SMS.SMSType': {
          DataType: 'String',
          StringValue: 'Transactional'
        }
      }
    };

    try {
      await this.sns.publish(params).promise();
      console.log(`SMS sent successfully to ${phoneNumber}`);
      return true;
    } catch (error) {
      console.error('Error sending SMS:', error);
      throw error;
    }
  }

  async scheduleNotifications(booking, userPhone) {
    const startTime = new Date(booking.start_time);
    const endTime = new Date(booking.end_time);
    
    // Schedule reminder 15 minutes before start time
    const reminderTime = new Date(startTime.getTime() - 15 * 60000);
    if (reminderTime > new Date()) {
      setTimeout(async () => {
        const message = `Your laundry time starts in 15 minutes! Your ${booking.machine_type} is ready for use.`;
        await this.sendSMS(userPhone, message);
      }, reminderTime.getTime() - Date.now());
    }

    // Schedule overdue reminder at end time
    setTimeout(async () => {
      const message = `Your laundry time has ended. Please remove your items from the ${booking.machine_type} promptly.`;
      await this.sendSMS(userPhone, message);
    }, endTime.getTime() - Date.now());

    // Schedule final warning 15 minutes after end time
    setTimeout(async () => {
      const message = `⚠️ URGENT: Your items are still in the ${booking.machine_type}. Please remove them immediately to avoid any inconvenience to others.`;
      await this.sendSMS(userPhone, message);
    }, endTime.getTime() + 15 * 60000 - Date.now());
  }
}

export const notificationService = new NotificationService();