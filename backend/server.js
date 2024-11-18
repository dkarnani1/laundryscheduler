const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const AWS = require('aws-sdk');

dotenv.config();

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-2', // Provide a default region
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const sns = new AWS.SNS();
const app = express();
app.use(cors());
app.use(express.json());

// Database setup
const db = new sqlite3.Database(path.join(__dirname, 'laundry.db'), (err) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Connected to SQLite database');
  }
});

// Create tables
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

// Routes
app.post('/api/users/create', (req, res) => {
  const { email, name, phoneNumber } = req.body;
  
  if (!email) {
    res.status(400).json({ error: 'Email is required' });
    return;
  }

  const displayName = name || email;

  // First check if user exists
  db.get('SELECT id FROM users WHERE email = ?', [email], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    if (row) {
      // User exists, update their info
      db.run(
        'UPDATE users SET name = ?, phone_number = ? WHERE id = ?',
        [displayName, phoneNumber, row.id],
        (updateErr) => {
          if (updateErr) {
            res.status(500).json({ error: updateErr.message });
            return;
          }
          res.json({ id: row.id });
        }
      );
    } else {
      // User doesn't exist, create new user
      db.run(
        'INSERT INTO users (email, name, phone_number) VALUES (?, ?, ?)',
        [email, displayName, phoneNumber],
        function(err) {
          if (err) {
            res.status(500).json({ error: err.message });
            return;
          }
          res.json({ id: this.lastID });
        }
      );
    }
  });
});

// Get user by email
app.get('/api/users', (req, res) => {
  const { email } = req.query;
  
  if (email) {
    db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      if (!row) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      res.json(row);
    });
  } else {
    db.all('SELECT * FROM users', [], (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
    });
  }
});

app.get('/api/bookings', (req, res) => {
  db.all(`
    SELECT * FROM bookings
  `, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.post('/api/bookings', (req, res) => {
  const { userEmail, userName, machineType, startTime, endTime } = req.body;
  
  // Check for conflicts
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
    
    // Create booking if no conflicts
    db.run(`
      INSERT INTO bookings (user_email, user_name, machine_type, start_time, end_time)
      VALUES (?, ?, ?, ?, ?)
    `, [userEmail, userName, machineType, startTime, endTime], function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }

      // Schedule reminder with Cognito data
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

app.get('/api/users/name', (req, res) => {
  const { email } = req.query;
  
  if (!email) {
    res.status(400).json({ error: 'Email is required' });
    return;
  }

  db.get('SELECT name FROM users WHERE email = ?', [email], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(row || { name: null });
  });
});

// Modified POST endpoint for setting user's name
app.post('/api/users/name', (req, res) => {
  const { email, name } = req.body;
  
  if (!email || !name) {
    res.status(400).json({ error: 'Email and name are required' });
    return;
  }

  // First check if user exists
  db.get('SELECT id FROM users WHERE email = ?', [email], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    if (row) {
      // Update existing user
      db.run('UPDATE users SET name = ? WHERE email = ?', [name, email], (updateErr) => {
        if (updateErr) {
          res.status(500).json({ error: updateErr.message });
          return;
        }
        res.json({ success: true });
      });
    } else {
      // Insert new user
      db.run('INSERT INTO users (email, name) VALUES (?, ?)', [email, name], (insertErr) => {
        if (insertErr) {
          res.status(500).json({ error: insertErr.message });
          return;
        }
        res.json({ success: true });
      });
    }
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
    await sns.publish(params).promise();
    console.log(`SMS sent successfully to ${phoneNumber}`);
    return true;
  } catch (error) {
    console.error('Error sending SMS:', error);
    return false;
  }
}

function scheduleReminder(bookingId, userEmail, userName, machineType, endTime) {
  const reminderTime = endTime - (10 * 60 * 1000); // 10 minutes before end time
  const now = Date.now();
  
  if (reminderTime > now) {
    const delay = reminderTime - now;
    
    setTimeout(async () => {
      // Check if booking still exists
      db.get('SELECT * FROM bookings WHERE id = ?', [bookingId], async (err, booking) => {
        if (err || !booking) {
          console.log('Booking no longer exists, skipping reminder');
          return;
        }

        // Get phone number directly from Cognito
        const message = `Hi ${userName}! Your ${machineType} time slot will end in 10 minutes. Please remember to remove your laundry promptly.`;
        await sendSMS(booking.phone_number, message);
      });
    }, delay);
  }
}

const server = app.listen(port, '0.0.0.0', (err) => {
  if (err) {
      console.error('Error starting server:', err);
      process.exit(1);
  }
  console.log(`Server running on port ${port}`);
});

process.on('SIGTERM', () => {
  server.close(() => {
      console.log('Server terminated');
  });
});