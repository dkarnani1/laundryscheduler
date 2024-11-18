const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");

dotenv.config();

const snsClient = new SNSClient({
  region: process.env.AWS_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

app.use(cors({
  origin: ['https://laundryscheduler.com', 'https://www.laundryscheduler.com'],
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  credentials: true
}));

app.use(express.json());
const PORT = 3002;

const db = new sqlite3.Database(path.join(__dirname, 'laundry.db'), (err) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Connected to SQLite database');
  }
});

db.serialize(() => {
  db.run('DROP TABLE IF EXISTS bookings');
  db.run(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_email TEXT NOT NULL,
      user_name TEXT NOT NULL,
      machine_type TEXT NOT NULL,
      start_time INTEGER NOT NULL,
      end_time INTEGER NOT NULL
    )
  `);
});

app.get('/api/bookings', (req, res) => {
  db.all(`SELECT * FROM bookings`, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.post('/api/bookings', (req, res) => {
  const { userEmail, userName, machineType, startTime, endTime } = req.body;
  
  db.get(`
    SELECT COUNT(*) as count 
    FROM bookings 
    WHERE machine_type = ? 
    AND ((start_time <= ? AND end_time > ?) 
    OR (start_time < ? AND end_time >= ?))
  `, [machineType, startTime, startTime, endTime, endTime], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (row.count > 0) {
      res.status(409).json({ error: 'Time slot already booked' });
      return;
    }
    
    db.run(`
      INSERT INTO bookings (user_email, user_name, machine_type, start_time, end_time)
      VALUES (?, ?, ?, ?, ?)
    `, [userEmail, userName, machineType, startTime, endTime], function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }

      if (endTime) {
        scheduleReminder(this.lastID, userEmail, userName, machineType, endTime);
      }
      
      res.json({ id: this.lastID });
    });
  });
});

app.delete('/api/bookings/:id', (req, res) => {
  db.run('DELETE FROM bookings WHERE id = ?', [req.params.id], (err) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: 'Booking deleted' });
  });
});

async function sendSMS(phoneNumber, message) {
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
    await snsClient.send(new PublishCommand(params));
    console.log(`SMS sent successfully to ${phoneNumber}`);
    return true;
  } catch (error) {
    console.error('Error sending SMS:', error);
    return false;
  }
}

function scheduleReminder(bookingId, userEmail, userName, machineType, endTime) {
  const reminderTime = endTime - (10 * 60 * 1000);
  const now = Date.now();
  
  if (reminderTime > now) {
    const delay = reminderTime - now;
    
    setTimeout(async () => {
      db.get('SELECT * FROM bookings WHERE id = ?', [bookingId], async (err, booking) => {
        if (err || !booking) {
          console.log('Booking no longer exists, skipping reminder');
          return;
        }

        const message = `Hi ${userName}! Your ${machineType} time slot will end in 10 minutes. Please remember to remove your laundry promptly.`;
        await sendSMS(booking.phone_number, message);
      });
    }, delay);
  }
}

app.get('/', (req, res) => {
  res.send('Server is running');
});

const server = app.listen(PORT, '0.0.0.0', (err) => {
  if (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
  console.log(`Server running on port ${PORT}`);
});

process.on('SIGTERM', () => {
  server.close(() => {
    console.log('Server terminated');
  });
});