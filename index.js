const express = require('express');
const { JWT } = require('google-auth-library');
const axios = require('axios');
const bodyParser = require('body-parser');
const cors = require('cors');

// Configuration
const PROJECT_ID = 'rn-testapp-edc89'; // Replace with your Firebase project ID
const SERVICE_ACCOUNT_FILE = './serviceAccountKey.json'; // Path to your service account file

// Initialize Express
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Store device tokens (in production, use a database)
const deviceTokens = new Set();

// Helper function to get access token
async function getAccessToken() {
  const client = new JWT({
    keyFile: SERVICE_ACCOUNT_FILE,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  });

  const accessToken = await client.authorize();
  return accessToken.access_token;
}

// Register device token
app.post('/register', (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  deviceTokens.add(token);
  console.log('Registered token:', token);
  res.status(200).json({ message: 'Token registered successfully' });
});

// Send notification to single device
app.post('/send-notification', async (req, res) => {
  const { token, title, body, data } = req.body;

  if (!token || !title || !body) {
    return res.status(400).json({ error: 'Token, title and body are required' });
  }

  try {
    const accessToken = await getAccessToken();
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;

    const message = {
      message: {
        token: token,
        notification: {
          title: title,
          body: body
        },
        data: data || {}
      }
    };

    const response = await axios.post(fcmUrl, message, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('Successfully sent message:', response.data);
    res.status(200).json({ success: true, response: response.data });
  } catch (error) {
    console.error('Error sending message:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to send notification',
      details: error.response?.data || error.message
    });
  }
});

// Send notification to multiple devices
app.post('/send-multicast', async (req, res) => {
  const { tokens, title, body, data } = req.body;

  if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
    return res.status(400).json({ error: 'Valid tokens array is required' });
  }

  if (!title || !body) {
    return res.status(400).json({ error: 'Title and body are required' });
  }

  try {
    const accessToken = await getAccessToken();
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;

    // For multicast, we need to send individual requests
    const results = await Promise.all(tokens.map(async token => {
      const message = {
        message: {
          token: token,
          notification: {
            title: title,
            body: body
          },
          data: data || {}
        }
      };

      try {
        const response = await axios.post(fcmUrl, message, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });
        return { token, success: true, response: response.data };
      } catch (error) {
        return { token, success: false, error: error.response?.data || error.message };
      }
    }));

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    console.log(`Multicast results: ${successCount} success, ${failureCount} failures`);
    res.status(200).json({ 
      success: true, 
      results,
      successCount,
      failureCount
    });
  } catch (error) {
    console.error('Error in multicast:', error);
    res.status(500).json({ 
      error: 'Failed to send multicast notifications',
      details: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`FCM Google API Server running on port ${PORT}`);
});