const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const fs = require('fs');
const https = require('https');
const http = require('http');
const path = require('path');

dotenv.config();

const app = express();
const port = process.env.PORT || 3002;
const isProduction = process.env.NODE_ENV === 'production';

// CORS configuration
const corsOptions = {
  origin: isProduction 
    ? ['https://laundryscheduler.com', 'http://laundryscheduler.com']
    : '*',
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

app.use(express.json());

// Serve static files from the frontend dist directory in production
if (isProduction) {
  app.use(express.static(path.join(__dirname, 'dist')));
}

// Remove the database file only in development
if (!isProduction && fs.existsSync('./laundry.db')) {
  console.log('Removing existing database file');
  fs.unlinkSync('./laundry.db');
}

const db = new sqlite3.Database('./laundry.db', (err) => {
  if (err) {
    console.error('Error opening database', err);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// Create tables if they don't exist
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    code TEXT NOT NULL UNIQUE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT NOT NULL,
    user_name TEXT NOT NULL,
    machine_type TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    room_id INTEGER NOT NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id)
  )`);

  // Table to track membership in rooms, now includes user_picture
  db.run(`CREATE TABLE IF NOT EXISTS room_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL,
    user_email TEXT NOT NULL,
    user_name TEXT NOT NULL,
    user_picture TEXT,
    FOREIGN KEY (room_id) REFERENCES rooms(id)
  )`);
});

// Helper function to generate user name from token data
const generateUserName = (decoded, userId) => {
  // First try the standard Cognito attributes
  let userName = decoded.given_name || decoded.name || decoded.preferred_username;

  // If no name in standard attributes, try email
  if (!userName && decoded.email) {
    // Use the part before @ in the email
    userName = decoded.email.split('@')[0];
    // Convert underscore/dot to space and capitalize each word
    userName = userName
      .replace(/[_\.]/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    return userName;
  }

  // If still no name and we have a cognito:username, try to use that
  if (!userName && decoded['cognito:username']) {
    userName = decoded['cognito:username'];
    // If it looks like an email, process it
    if (userName.includes('@')) {
      userName = userName.split('@')[0]
        .replace(/[_\.]/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }
    return userName;
  }

  // If we got here and still don't have a name, use the userId but format it
  if (!userName) {
    // Check if userId appears to be a UUID
    if (userId.includes('-')) {
      // Extract part before first hyphen
      const firstPart = userId.split('-')[0];
      // If it's not too short, use it as a name
      if (firstPart.length >= 3) {
        return firstPart.charAt(0).toUpperCase() + firstPart.slice(1);
      }
    }

    // Default to "User" if everything else fails
    return "User";
  }

  return userName;
};

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Invalid token format' });
  }

  try {
    const decoded = jwt.decode(token);
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // "sub" or "cognito:username" identifies the user
    const userId = decoded['cognito:username'] || decoded.sub || decoded.email;
    if (!userId) {
      return res.status(401).json({ error: 'No user identifier in token' });
    }

    // Generate a proper user name
    const userName = generateUserName(decoded, userId);

    req.userId = userId;
    req.userName = userName;

    // We don't use the picture from token anymore, but we'll get it from the database later
    req.userPicture = ''; // Initialize as empty

    // Try to get the user's picture from the database
    db.get(
      'SELECT user_picture FROM room_members WHERE user_email = ? LIMIT 1',
      [userId],
      (err, row) => {
        if (err) {
          console.error('Error fetching user picture from DB:', err);
        } else if (row && row.user_picture) {
          req.userPicture = row.user_picture;
        }
        next();
      }
    );
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(401).json({ error: 'Failed to authenticate token' });
  }
};

// Debug logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Room routes

// Create a room, add user to room_members
app.post('/api/rooms', verifyToken, (req, res) => {
  const { name } = req.body;
  const createdBy = req.userId;
  const createdAt = Date.now();
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();

  db.run(
    'INSERT INTO rooms (name, created_by, created_at, code) VALUES (?, ?, ?, ?)',
    [name, createdBy, createdAt, code],
    function (err) {
      if (err) {
        console.error('Error creating room:', err);
        return res.status(500).json({ error: err.message });
      }
      const roomId = this.lastID;

      // Insert membership record using req.userName and req.userPicture
      db.run(
        'INSERT INTO room_members (room_id, user_email, user_name, user_picture) VALUES (?, ?, ?, ?)',
        [roomId, createdBy, req.userName, req.userPicture],
        (err2) => {
          if (err2) {
            console.error('Error creating membership:', err2);
            return res.status(500).json({ error: err2.message });
          }

          return res.json({
            id: roomId,
            name,
            createdBy,
            createdAt,
            code,
            members: [{
              email: createdBy,
              name: req.userName,
              picture: req.userPicture
            }]
          });
        }
      );
    }
  );
});

// Add a route to get the user's current picture URL
app.get('/api/user/picture', verifyToken, (req, res) => {
  db.get(
    'SELECT user_picture, user_name FROM room_members WHERE user_email = ? LIMIT 1',
    [req.userId],
    (err, row) => {
      if (err) {
        console.error('Error fetching user picture:', err);
        return res.status(500).json({ error: err.message });
      }
      
      res.json({ 
        picture: row?.user_picture || '',
        userId: req.userId,
        userName: row?.user_name || req.userName
      });
    }
  );
});

// Fetch all rooms that the user is a member of, with membership info
app.get('/api/rooms', verifyToken, (req, res) => {
  const userId = req.userId;

  db.all(`
    SELECT r.id AS roomId,
           r.name,
           r.created_by,
           r.created_at,
           r.code,
           rm.user_email,
           rm.user_name,
           rm.user_picture
    FROM rooms r
    INNER JOIN room_members rm ON r.id = rm.room_id
    WHERE r.id IN (
      SELECT room_id FROM room_members WHERE user_email = ?
    )
  `, [userId], (err, rows) => {
    if (err) {
      console.error('Error fetching rooms:', err);
      return res.status(500).json({ error: err.message });
    }

    const roomsById = {};
    rows.forEach(row => {
      if (!roomsById[row.roomId]) {
        roomsById[row.roomId] = {
          id: row.roomId,
          name: row.name,
          created_by: row.created_by,
          created_at: row.created_at,
          code: row.code,
          members: []
        };
      }
      roomsById[row.roomId].members.push({
        email: row.user_email,
        name: row.user_name,
        picture: row.user_picture
      });
    });

    // For the current user, override stored picture with the latest from the database
    const currentUserEmail = req.userId;
    Object.values(roomsById).forEach(room => {
      room.members = room.members.map(member => {
        if (member.email === currentUserEmail) {
          return { 
            ...member, 
            picture: req.userPicture,
            name: req.userName // Add this line to update the name too
          };
        }
        return member;
      });
    });

    res.json(Object.values(roomsById));
  });
});

// Join a room, add membership if not already
app.post('/api/rooms/join', verifyToken, (req, res) => {
  const { code } = req.body;
  db.get('SELECT * FROM rooms WHERE code = ?', [code], (err, room) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    db.get(
      'SELECT * FROM room_members WHERE room_id = ? AND user_email = ?',
      [room.id, req.userId],
      (err2, existing) => {
        if (err2) {
          return res.status(500).json({ error: err2.message });
        }
        if (!existing) {
          db.run(
            'INSERT INTO room_members (room_id, user_email, user_name, user_picture) VALUES (?, ?, ?, ?)',
            [room.id, req.userId, req.userName, req.userPicture],
            (err3) => {
              if (err3) {
                return res.status(500).json({ error: err3.message });
              }
              res.json(room);
            }
          );
        } else {
          res.json(room);
        }
      }
    );
  });
});

// Update membership data (picture and name) for current user
app.put('/api/user/membership', verifyToken, (req, res) => {
  const { picture } = req.body;
  
  if (!picture || typeof picture !== 'string') {
    return res.status(400).json({ error: 'Picture URL is required and must be a string' });
  }
  
  // Update the user's picture in all room memberships
  db.run(
    'UPDATE room_members SET user_picture = ? WHERE user_email = ?',
    [picture, req.userId],
    function (err) {
      if (err) {
        console.error('Error updating membership picture:', err);
        return res.status(500).json({ error: err.message });
      }
      
      const recordsUpdated = this.changes;
      
      // If no records were updated, it might be because the user hasn't joined any rooms yet
      if (recordsUpdated === 0) {
        console.log('No existing memberships found to update');
      }
      
      // Verify the update worked by retrieving a record
      db.get(
        'SELECT user_email, user_name, user_picture FROM room_members WHERE user_email = ? LIMIT 1',
        [req.userId],
        (err, row) => {
          if (err) {
            console.error('Error verifying update:', err);
          }
          
          res.json({ 
            message: 'Membership picture updated successfully', 
            recordsUpdated: recordsUpdated,
            success: true,
            picture: picture
          });
        }
      );
    }
  );
});

// Booking routes
app.get('/api/bookings/:roomId', verifyToken, (req, res) => {
  const { roomId } = req.params;
  
  if (!roomId) {
    return res.status(400).json({ error: 'Room ID is required' });
  }

  db.all('SELECT * FROM bookings WHERE room_id = ?', [roomId], (err, rows) => {
    if (err) {
      console.error('Error fetching bookings:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

app.post('/api/bookings', verifyToken, (req, res) => {
  const { userEmail, userName, machineType, startTime, endTime, roomId } = req.body;

  if (!userEmail || !userName || !machineType || !startTime || !endTime || !roomId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  db.get(
    `SELECT COUNT(*) as count FROM bookings 
     WHERE machine_type = ? 
     AND room_id = ?
     AND ((start_time <= ? AND end_time > ?) OR (start_time < ? AND end_time >= ?))`,
    [machineType, roomId, startTime, startTime, endTime, endTime],
    (err, result) => {
      if (err) {
        console.error('Error checking conflicts:', err);
        return res.status(500).json({ error: err.message });
      }

      if (result.count > 0) {
        return res.status(409).json({ error: 'Time slot is already booked' });
      }

      db.run(
        'INSERT INTO bookings (user_email, user_name, machine_type, start_time, end_time, room_id) VALUES (?, ?, ?, ?, ?, ?)',
        [userEmail, userName, machineType, startTime, endTime, roomId],
        function(err2) {
          if (err2) {
            console.error('Error creating booking:', err2);
            return res.status(500).json({ error: err2.message });
          }
          res.json({
            id: this.lastID,
            userEmail,
            userName,
            machine_type: machineType,
            startTime,
            endTime,
            roomId
          });
        }
      );
    }
  );
});

app.delete('/api/bookings/:id', verifyToken, (req, res) => {
  const { id } = req.params;
  
  if (!id) {
    return res.status(400).json({ error: 'Booking ID is required' });
  }

  db.run('DELETE FROM bookings WHERE id = ?', [id], (err) => {
    if (err) {
      console.error('Error deleting booking:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Booking deleted successfully' });
  });
});

// Server creation with HTTPS support
let server;
if (isProduction) {
  try {
    const privateKey = fs.readFileSync('/etc/letsencrypt/live/laundryscheduler.com/privkey.pem', 'utf8');
    const certificate = fs.readFileSync('/etc/letsencrypt/live/laundryscheduler.com/fullchain.pem', 'utf8');
    const credentials = { key: privateKey, cert: certificate };

    // HTTP server to redirect to HTTPS
    http.createServer((req, res) => {
      res.writeHead(301, { "Location": "https://" + req.headers['host'] + req.url });
      res.end();
    }).listen(80);

    // HTTPS server
    server = https.createServer(credentials, app);
    server.listen(port, () => {
      console.log(`HTTPS Server running on port ${port}`);
    });
  } catch (err) {
    console.error('Error setting up HTTPS:', err);
    // Fallback to HTTP if certificate reading fails
    server = app.listen(port, () => {
      console.log(`HTTP Server running on port ${port}`);
    });
  }
} else {
  // Development server
  server = app.listen(port, () => {
    console.log(`HTTP Server running on port ${port}`);
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received. Closing HTTP server.');
  server.close(() => {
    console.log('HTTP server closed');
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      }
      console.log('Database connection closed');
      process.exit(0);
    });
  });
});

module.exports = server;
