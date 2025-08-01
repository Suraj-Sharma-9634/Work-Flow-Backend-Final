require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const FacebookStrategy = require('passport-facebook').Strategy;
const axios = require('axios');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 10000;

// Configuration
const config = {
  instagram: {
    appId: process.env.INSTAGRAM_APP_ID || '1477959410285896',
    appSecret: process.env.INSTAGRAM_APP_SECRET,
    redirectUri: process.env.REDIRECT_URI || 'https://work-automation-platform.onrender.com/auth/instagram/callback'
  },
  facebook: {
    appId: process.env.FACEBOOK_APP_ID || '1256408305896903',
    appSecret: process.env.FACEBOOK_APP_SECRET || 'fc7fbca3fbecd5bc6b06331bc4da17c9',
    callbackUrl: process.env.FACEBOOK_CALLBACK || 'https://work-automation-platform.onrender.com/auth/facebook/callback'
  },
  whatsapp: {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '657991800734493',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'verify-me'
  },
  webhook: {
    verifyToken: process.env.WEBHOOK_VERIFY_TOKEN || 'WORKFLOW_VERIFY_TOKEN'
  }
};

console.log('🚀 Starting Work Automation Platform');
console.log('=====================================');
console.log(`PORT: ${PORT}`);
console.log(`Instagram App ID: ${config.instagram.appId ? 'Set' : '❌ MISSING'}`);
console.log(`Facebook App ID: ${config.facebook.appId ? 'Set' : '❌ MISSING'}`);
console.log(`WhatsApp Phone ID: ${config.whatsapp.phoneNumberId ? 'Set' : '❌ MISSING'}`);
console.log('=====================================');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'work_automation_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

app.use(passport.initialize());
app.use(passport.session());

// Passport setup
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new FacebookStrategy({
  clientID: config.facebook.appId,
  clientSecret: config.facebook.appSecret,
  callbackURL: config.facebook.callbackUrl,
  profileFields: ['id', 'displayName', 'emails']
}, (accessToken, refreshToken, profile, done) => {
  profile.accessToken = accessToken;
  return done(null, profile);
}));

// Data storage
const users = new Map();
const configurations = new Map();
const usedAuthorizationCodes = new Set();
const whatsappMemory = {};
let assignedAI = { key: '', systemPrompt: '', waToken: '' };
let frontendSocket = null;

// WebSocket connection
io.on('connection', (socket) => {
  console.log('🌐 Frontend connected');
  frontendSocket = socket;
  socket.on('disconnect', () => {
    console.log('❌ Frontend disconnected');
    frontendSocket = null;
  });
});

// Utility functions
function serializeError(err) {
  if (!err) return 'Unknown error';
  if (err instanceof Error) {
    const errorObj = {
      name: err.name,
      message: err.message,
      stack: err.stack
    };
    if (err.response) {
      errorObj.response = {
        status: err.response.status,
        data: err.response.data,
        headers: err.response.headers
      };
    }
    return JSON.stringify(errorObj, null, 2);
  }
  return JSON.stringify(err, null, 2);
}

async function getPageAccessToken(userToken) {
  try {
    const resp = await axios.get(`https://graph.facebook.com/me/accounts?access_token=${userToken}`);
    if (resp.data?.data?.length) return resp.data.data[0];
    return null;
  } catch (err) {
    console.error("Page token error:", err);
    return null;
  }
}

// Routes

// Home page
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Work - Social Media Automation Platform</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; margin: 0; padding: 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; min-height: 100vh; }
        .container { max-width: 800px; margin: 0 auto; text-align: center; }
        h1 { font-size: 3rem; margin-bottom: 20px; }
        p { font-size: 1.2rem; margin-bottom: 40px; opacity: 0.9; }
        .platform-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 30px; margin: 40px 0; }
        .platform-card { background: rgba(255,255,255,0.1); backdrop-filter: blur(10px); padding: 30px; border-radius: 15px; border: 1px solid rgba(255,255,255,0.2); }
        .platform-card h3 { margin-bottom: 15px; color: #fff; }
        .btn { display: inline-block; padding: 12px 24px; background: rgba(255,255,255,0.9); color: #333; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 10px; transition: all 0.3s; }
        .btn:hover { background: white; transform: translateY(-2px); }
        .dashboard-btn { background: #ff6b6b; color: white; }
        .dashboard-btn:hover { background: #ff5252; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Work Automation</h1>
        <p>Automate your social media interactions across Instagram, Facebook Messenger, and WhatsApp</p>
        
        <div class="platform-grid">
          <div class="platform-card">
            <h3>📸 Instagram</h3>
            <p>Automate comments and DMs based on keywords</p>
            <a href="/auth/instagram" class="btn">Connect Instagram</a>
          </div>
          
          <div class="platform-card">
            <h3>💬 Facebook Messenger</h3>
            <p>Manage conversations and send automated messages</p>
            <a href="/auth/facebook" class="btn">Connect Facebook</a>
          </div>
          
          <div class="platform-card">
            <h3>📱 WhatsApp Business</h3>
            <p>AI-powered customer support automation</p>
            <a href="/whatsapp-setup" class="btn">Setup WhatsApp</a>
          </div>
        </div>
        
        <a href="/dashboard" class="btn dashboard-btn">Go to Dashboard</a>
      </div>
    </body>
    </html>
  `);
});

// Dashboard
app.get('/dashboard', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Work Dashboard</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .header { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 30px; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
        .stat-number { font-size: 2rem; font-weight: bold; color: #667eea; }
        .actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .action-card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .btn { display: inline-block; padding: 10px 20px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 5px; }
        .btn:hover { background: #5a67d8; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Work Dashboard</h1>
        <p>Manage your social media automation</p>
      </div>
      
      <div class="stats">
        <div class="stat-card">
          <div class="stat-number" id="instagram-users">0</div>
          <div>Instagram Users</div>
        </div>
        <div class="stat-card">
          <div class="stat-number" id="configurations">0</div>
          <div>Active Automations</div>
        </div>
        <div class="stat-card">
          <div class="stat-number" id="messages-sent">0</div>
          <div>Messages Sent</div>
        </div>
      </div>
      
      <div class="actions">
        <div class="action-card">
          <h3>📸 Instagram Automation</h3>
          <p>Set up keyword-based comment responses</p>
          <a href="/instagram-dashboard" class="btn">Manage Instagram</a>
        </div>
        
        <div class="action-card">
          <h3>💬 Messenger Management</h3>
          <p>View and respond to Facebook messages</p>
          <a href="/messenger-dashboard" class="btn">Manage Messenger</a>
        </div>
        
        <div class="action-card">
          <h3>📱 WhatsApp AI</h3>
          <p>Configure AI responses for WhatsApp</p>
          <a href="/whatsapp-dashboard" class="btn">Manage WhatsApp</a>
        </div>
      </div>
      
      <script>
        // Update stats
        fetch('/api/stats')
          .then(r => r.json())
          .then(data => {
            document.getElementById('instagram-users').textContent = data.instagramUsers || 0;
            document.getElementById('configurations').textContent = data.configurations || 0;
            document.getElementById('messages-sent').textContent = data.messagesSent || 0;
          });
      </script>
    </body>
    </html>
  `);
});

// API: Get stats
app.get('/api/stats', (req, res) => {
  res.json({
    instagramUsers: users.size,
    configurations: configurations.size,
    messagesSent: 0 // You can track this separately
  });
});

// INSTAGRAM ROUTES

// Instagram auth
app.get('/auth/instagram', (req, res) => {
  try {
    const authUrl = `https://www.instagram.com/oauth/authorize?force_reauth=true&client_id=${config.instagram.appId}&redirect_uri=${encodeURIComponent(config.instagram.redirectUri)}&response_type=code&scope=instagram_business_basic%2Cinstagram_business_manage_messages%2Cinstagram_business_manage_comments%2Cinstagram_business_content_publish%2Cinstagram_business_manage_insights`;
    console.log('🔗 Redirecting to Instagram Auth URL:', authUrl);
    res.redirect(authUrl);
  } catch (err) {
    console.error('🔥 Instagram login redirect error:', serializeError(err));
    res.status(500).send('Server error during Instagram login');
  }
});

// Instagram callback
app.get('/auth/instagram/callback', async (req, res) => {
  try {
    console.log('📬 Received Instagram callback:', req.query);
    const { code, error, error_reason } = req.query;
    
    if (error) {
      throw new Error(`OAuth error: ${error_reason || 'unknown'} - ${error}`);
    }

    if (!code) {
      throw new Error('Authorization code is missing');
    }

    if (usedAuthorizationCodes.has(code)) {
      console.warn('⚠️ Authorization code reuse detected:', code);
      for (const [userId, userData] of users.entries()) {
        if (userData.code === code) {
          console.log(`↩️ Redirecting reused code to existing user: ${userId}`);
          return res.redirect(`/instagram-dashboard?user_id=${userId}`);
        }
      }
      throw new Error('Authorization code has already been used');
    }
    
    usedAuthorizationCodes.add(code);

    // Exchange code for token
    const tokenResponse = await axios.post('https://api.instagram.com/oauth/access_token', {
      client_id: config.instagram.appId,
      client_secret: config.instagram.appSecret,
      grant_type: 'authorization_code',
      redirect_uri: config.instagram.redirectUri,
      code: code
    }, {
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-IG-App-ID': config.instagram.appId
      }
    });

    if (!tokenResponse.data || !tokenResponse.data.access_token) {
      throw new Error('Invalid token response: ' + JSON.stringify(tokenResponse.data));
    }

    console.log('✅ Token exchange successful');
    const access_token = tokenResponse.data.access_token;
    const user_id = String(tokenResponse.data.user_id);

    // Get user profile
    const profileResponse = await axios.get(`https://graph.instagram.com/me`, {
      params: { 
        fields: 'id,username,profile_picture_url',
        access_token: access_token
      },
      headers: { 'X-IG-App-ID': config.instagram.appId }
    });

    console.log(`👋 User authenticated: ${profileResponse.data.username} (ID: ${user_id})`);
    
    const userData = {
      access_token,
      username: profileResponse.data.username,
      profile_pic: profileResponse.data.profile_picture_url,
      instagram_id: user_id,
      last_login: new Date(),
      code,
      platform: 'instagram'
    };
    users.set(user_id, userData);

    res.redirect(`/instagram-dashboard?user_id=${user_id}`);
  } catch (err) {
    console.error('🔥 Instagram authentication error:', serializeError(err));
    res.redirect(`/?error=instagram_auth_failed&message=${encodeURIComponent('Instagram login failed. Please try again.')}`);
  }
});

// Instagram dashboard
app.get('/instagram-dashboard', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Instagram Dashboard - Work</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .btn { padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer; }
        .btn:hover { background: #5a67d8; }
        .post-item { border: 1px solid #eee; padding: 15px; margin: 10px 0; border-radius: 8px; }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; margin-bottom: 5px; font-weight: 600; }
        .form-group input, .form-group textarea, .form-group select { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📸 Instagram Automation Dashboard</h1>
          <p>Manage your Instagram comment and DM automation</p>
          <a href="/dashboard" class="btn">← Back to Dashboard</a>
        </div>
        
        <div class="grid">
          <div class="card">
            <h3>Your Posts</h3>
            <button onclick="loadPosts()" class="btn">Load Posts</button>
            <div id="posts-container"></div>
          </div>
          
          <div class="card">
            <h3>Setup Automation</h3>
            <div class="form-group">
              <label>Select Post:</label>
              <select id="post-select">
                <option value="">Select a post first</option>
              </select>
            </div>
            <div class="form-group">
              <label>Keyword Trigger:</label>
              <input type="text" id="keyword" placeholder="e.g., 'price', 'info', 'dm me'">
            </div>
            <div class="form-group">
              <label>Auto Response:</label>
              <textarea id="response" placeholder="Use {username} to mention the user" rows="4"></textarea>
            </div>
            <button onclick="saveConfiguration()" class="btn">Save Automation</button>
          </div>
        </div>
        
        <div class="card" style="margin-top: 20px;">
          <h3>Send Manual DM</h3>
          <div class="grid">
            <div class="form-group">
              <label>Username:</label>
              <input type="text" id="dm-username" placeholder="@username">
            </div>
            <div class="form-group">
              <label>Message:</label>
              <textarea id="dm-message" rows="3"></textarea>
            </div>
          </div>
          <button onclick="sendManualDM()" class="btn">Send DM</button>
        </div>
      </div>
      
      <script>
        const urlParams = new URLSearchParams(window.location.search);
        const userId = urlParams.get('user_id');
        
        if (!userId) {
          alert('Please connect your Instagram account first');
          window.location.href = '/';
        }
        
        async function loadPosts() {
          try {
            const response = await fetch(\`/api/instagram/posts?userId=\${userId}\`);
            const posts = await response.json();
            
            const container = document.getElementById('posts-container');
            const select = document.getElementById('post-select');
            
            container.innerHTML = '';
            select.innerHTML = '<option value="">Select a post</option>';
            
            posts.forEach(post => {
              const postDiv = document.createElement('div');
              postDiv.className = 'post-item';
              postDiv.innerHTML = \`
                <p><strong>Caption:</strong> \${post.caption.substring(0, 100)}...</p>
                <p><strong>Type:</strong> \${post.media_type}</p>
                <button onclick="viewComments('\${post.id}')" class="btn">View Comments</button>
              \`;
              container.appendChild(postDiv);
              
              const option = document.createElement('option');
              option.value = post.id;
              option.textContent = post.caption.substring(0, 50) + '...';
              select.appendChild(option);
            });
          } catch (error) {
            alert('Error loading posts: ' + error.message);
          }
        }
        
        async function viewComments(postId) {
          try {
            const response = await fetch(\`/api/instagram/comments?userId=\${userId}&postId=\${postId}\`);
            const comments = await response.json();
            
            let commentsText = 'Comments:\\n\\n';
            comments.forEach(comment => {
              commentsText += \`@\${comment.username}: \${comment.text}\\n\\n\`;
            });
            
            alert(commentsText || 'No comments found');
          } catch (error) {
            alert('Error loading comments: ' + error.message);
          }
        }
        
        async function saveConfiguration() {
          const postId = document.getElementById('post-select').value;
          const keyword = document.getElementById('keyword').value;
          const response = document.getElementById('response').value;
          
          if (!postId || !keyword || !response) {
            alert('Please fill all fields');
            return;
          }
          
          try {
            const result = await fetch('/api/instagram/configure', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId, postId, keyword, response })
            });
            
            if (result.ok) {
              alert('Automation configured successfully!');
              document.getElementById('keyword').value = '';
              document.getElementById('response').value = '';
            } else {
              throw new Error('Configuration failed');
            }
          } catch (error) {
            alert('Error saving configuration: ' + error.message);
          }
        }
        
        async function sendManualDM() {
          const username = document.getElementById('dm-username').value.replace('@', '');
          const message = document.getElementById('dm-message').value;
          
          if (!username || !message) {
            alert('Please fill username and message');
            return;
          }
          
          try {
            const result = await fetch('/api/instagram/send-dm', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId, username, message })
            });
            
            if (result.ok) {
              alert('DM sent successfully!');
              document.getElementById('dm-username').value = '';
              document.getElementById('dm-message').value = '';
            } else {
              throw new Error('Failed to send DM');
            }
          } catch (error) {
            alert('Error sending DM: ' + error.message);
          }
        }
      </script>
    </body>
    </html>
  `);
});

// Instagram API endpoints
app.get('/api/instagram/posts', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    const user = users.get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const response = await axios.get(`https://graph.instagram.com/v19.0/me/media`, {
      params: {
        fields: 'id,caption,media_url,media_type,thumbnail_url',
        access_token: user.access_token
      },
      headers: { 'X-IG-App-ID': config.instagram.appId }
    });

    const processedPosts = response.data.data.map(post => ({
      id: post.id,
      caption: post.caption || '',
      media_url: post.media_type === 'VIDEO' ? (post.thumbnail_url || '') : post.media_url,
      media_type: post.media_type
    }));

    res.json(processedPosts);
  } catch (err) {
    console.error('🔥 Instagram posts error:', serializeError(err));
    res.status(500).json({ error: 'Error fetching posts' });
  }
});

app.get('/api/instagram/comments', async (req, res) => {
  try {
    const { userId, postId } = req.query;
    if (!userId || !postId) {
      return res.status(400).json({ error: 'User ID and Post ID required' });
    }

    const user = users.get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const response = await axios.get(`https://graph.instagram.com/v19.0/${postId}/comments`, {
      params: {
        fields: 'id,text,username,timestamp',
        access_token: user.access_token
      },
      headers: { 'X-IG-App-ID': config.instagram.appId }
    });

    res.json(response.data.data || []);
  } catch (err) {
    console.error('🔥 Instagram comments error:', serializeError(err));
    res.status(500).json({ error: 'Error fetching comments' });
  }
});

app.post('/api/instagram/configure', async (req, res) => {
  try {
    const { userId, postId, keyword, response } = req.body;
    if (!userId || !postId || !keyword || !response) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const user = users.get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    configurations.set(userId, { postId, keyword, response });
    console.log(`⚙️ Instagram configuration saved for user ${userId} on post ${postId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('🔥 Instagram configuration error:', serializeError(err));
    res.status(500).json({ error: 'Configuration failed' });
  }
});

// Fixed Instagram DM sending
app.post('/api/instagram/send-dm', async (req, res) => {
  try {
    const { userId, username, message } = req.body;
    if (!userId || !username || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const user = users.get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    console.log(`✉️ Sending Instagram DM to ${username}: ${message.substring(0, 50)}...`);
    
    // Use the correct Instagram API endpoint for sending messages
    const response = await axios.post(`https://graph.facebook.com/v19.0/${user.instagram_id}/messages`, {
      recipient: { username: username },
      message: { text: message }
    }, {
      headers: {
        'Authorization': `Bearer ${user.access_token}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    console.log(`✅ Instagram DM sent to ${username}`);
    res.json({ success: true, data: response.data });
  } catch (err) {
    console.error('🔥 Instagram DM error:', serializeError(err));
    
    // Better error handling for Instagram API
    let errorMessage = 'Failed to send DM';
    if (err.response && err.response.data) {
      if (err.response.data.error && err.response.data.error.message) {
        errorMessage = err.response.data.error.message;
      }
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

// FACEBOOK MESSENGER ROUTES

app.get('/auth/facebook', passport.authenticate('facebook', {
  scope: ['pages_show_list', 'pages_messaging', 'pages_manage_metadata', 'pages_read_engagement']
}));

app.get('/auth/facebook/callback', passport.authenticate('facebook', {
  failureRedirect: '/?error=facebook_auth_failed'
}), (req, res) => {
  res.redirect('/messenger-dashboard');
});

app.get('/messenger-dashboard', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/auth/facebook');
  }
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Messenger Dashboard - Work</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .conversations { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .conversation-item { display: flex; align-items: center; padding: 15px; border-bottom: 1px solid #eee; cursor: pointer; }
        .conversation-item:hover { background: #f8f9fa; }
        .avatar { width: 50px; height: 50px; border-radius: 50%; background: #667eea; margin-right: 15px; }
        .btn { padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer; text-decoration: none; display: inline-block; }
        .btn:hover { background: #5a67d8; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>💬 Facebook Messenger Dashboard</h1>
          <p>Welcome, ${req.user.displayName}! Manage your Facebook page conversations</p>
          <a href="/dashboard" class="btn">← Back to Dashboard</a>
          <a href="/auth/logout" class="btn" style="background: #dc3545;">Logout</a>
        </div>
        
        <div class="conversations">
          <h3>Your Conversations</h3>
          <div id="conversations-container">
            <p>Loading conversations...</p>
          </div>
        </div>
      </div>
      
      <script>
        async function loadConversations() {
          try {
            const response = await fetch('/api/messenger/conversations');
            const data = await response.json();
            
            const container = document.getElementById('conversations-container');
            container.innerHTML = '';
            
            if (data.conversations && data.conversations.length > 0) {
              data.conversations.forEach(convo => {
                const item = document.createElement('div');
                item.className = 'conversation-item';
                item.onclick = () => window.location.href = \`/messenger-chat?id=\${convo.id}\`;
                item.innerHTML = \`
                  <img src="\${convo.avatar || '/default-avatar.png'}" class="avatar" />
                  <div>
                    <strong>\${convo.name || 'Unknown User'}</strong>
                    <p style="margin: 5px 0; color: #666;">\${convo.lastMessage || 'No messages'}</p>
                  </div>
                \`;
                container.appendChild(item);
              });
            } else {
              container.innerHTML = '<p>No conversations found</p>';
            }
          } catch (error) {
            document.getElementById('conversations-container').innerHTML = '<p>Error loading conversations</p>';
            console.error('Error:', error);
          }
        }
        
        loadConversations();
      </script>
    </body>
    </html>
  `);
});

// Messenger API endpoints
app.get('/api/messenger/conversations', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const page = await getPageAccessToken(req.user.accessToken);
    if (!page) {
      return res.json({ conversations: [] });
    }

    const response = await axios.get(`https://graph.facebook.com/${page.id}/conversations`, {
      params: { access_token: page.access_token }
    });

    const conversations = [];
    for (let convo of response.data.data || []) {
      try {
        const convoDetail = await axios.get(`https://graph.facebook.com/${convo.id}`, {
          params: {
            fields: 'participants',
            access_token: page.access_token
          }
        });
        
        const recipient = convoDetail.data.participants?.data?.find(p => p.id !== req.user.id);
        if (recipient) {
          const userInfo = await axios.get(`https://graph.facebook.com/${recipient.id}`, {
            params: {
              fields: 'name,picture',
              access_token: page.access_token
            }
          });
          
          conversations.push({
            id: convo.id,
            name: userInfo.data.name || recipient.id,
            avatar: userInfo.data.picture?.data?.url || ''
          });
        }
      } catch (err) {
        console.error('Error processing conversation:', err.message);
      }
    }

    res.json({ conversations });
  } catch (err) {
    console.error('🔥 Messenger conversations error:', serializeError(err));
    res.status(500).json({ error: 'Failed to load conversations' });
  }
});

app.get('/messenger-chat', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/auth/facebook');
  }
  
  const conversationId = req.query.id;
  if (!conversationId) {
    return res.redirect('/messenger-dashboard');
  }
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Messenger Chat - Work</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; margin: 0; padding: 0; background: #f5f5f5; height: 100vh; display: flex; flex-direction: column; }
        .header { background: white; padding: 15px 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        .chat-container { flex: 1; display: flex; flex-direction: column; padding: 20px; overflow: hidden; }
        .messages { flex: 1; background: white; border-radius: 10px; padding: 20px; overflow-y: auto; margin-bottom: 20px; }
        .message { margin-bottom: 15px; display: flex; align-items: flex-start; }
        .message.sent { justify-content: flex-end; }
        .message-content { max-width: 70%; padding: 10px 15px; border-radius: 18px; }
        .message.received .message-content { background: #e4e6ea; }
        .message.sent .message-content { background: #0084ff; color: white; }
        .message-input { display: flex; gap: 10px; }
        .message-input input { flex: 1; padding: 12px; border: 1px solid #ddd; border-radius: 20px; }
        .message-input button { padding: 12px 20px; background: #0084ff; color: white; border: none; border-radius: 20px; cursor: pointer; }
        .btn { padding: 8px 16px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; }
      </style>
    </head>
    <body>
      <div class="header">
        <a href="/messenger-dashboard" class="btn">← Back to Conversations</a>
        <span style="margin-left: 20px; font-weight: 600;">Chat Conversation</span>
      </div>
      
      <div class="chat-container">
        <div class="messages" id="messages-container">
          <p>Loading messages...</p>
        </div>
        
        <div class="message-input">
          <input type="text" id="message-input" placeholder="Type a message..." onkeypress="handleKeyPress(event)">
          <button onclick="sendMessage()">Send</button>
        </div>
      </div>
      
      <script>
        const conversationId = '${conversationId}';
        
        async function loadMessages() {
          try {
            const response = await fetch(\`/api/messenger/messages?id=\${conversationId}\`);
            const data = await response.json();
            
            const container = document.getElementById('messages-container');
            container.innerHTML = '';
            
            if (data.messages && data.messages.length > 0) {
              data.messages.forEach(msg => {
                const messageDiv = document.createElement('div');
                messageDiv.className = \`message \${msg.isFromPage ? 'sent' : 'received'}\`;
                messageDiv.innerHTML = \`
                  <div class="message-content">
                    <div>\${msg.text}</div>
                    <small style="opacity: 0.7; font-size: 11px;">\${msg.sender}</small>
                  </div>
                \`;
                container.appendChild(messageDiv);
              });
              container.scrollTop = container.scrollHeight;
            } else {
              container.innerHTML = '<p>No messages found</p>';
            }
          } catch (error) {
            console.error('Error loading messages:', error);
            document.getElementById('messages-container').innerHTML = '<p>Error loading messages</p>';
          }
        }
        
        async function sendMessage() {
          const input = document.getElementById('message-input');
          const message = input.value.trim();
          
          if (!message) return;
          
          try {
            const response = await fetch('/api/messenger/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: conversationId, message })
            });
            
            if (response.ok) {
              input.value = '';
              loadMessages(); // Reload messages
            } else {
              alert('Failed to send message');
            }
          } catch (error) {
            console.error('Error sending message:', error);
            alert('Error sending message');
          }
        }
        
        function handleKeyPress(event) {
          if (event.key === 'Enter') {
            sendMessage();
          }
        }
        
        loadMessages();
        // Refresh messages every 5 seconds
        setInterval(loadMessages, 5000);
      </script>
    </body>
    </html>
  `);
});

app.get('/api/messenger/messages', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { id } = req.query;
    const page = await getPageAccessToken(req.user.accessToken);
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    const response = await axios.get(`https://graph.facebook.com/${id}/messages`, {
      params: {
        fields: 'message,from,created_time',
        access_token: page.access_token
      }
    });

    const messages = await Promise.all((response.data.data || []).map(async msg => {
      try {
        const userResponse = await axios.get(`https://graph.facebook.com/${msg.from.id}`, {
          params: {
            fields: 'name,picture',
            access_token: page.access_token
          }
        });
        
        return {
          sender: userResponse.data.name || msg.from.id,
          text: msg.message || '[No text]',
          pfp: userResponse.data.picture?.data?.url || '',
          isFromPage: msg.from.id === page.id,
          timestamp: msg.created_time
        };
      } catch (err) {
        return {
          sender: 'Unknown',
          text: msg.message || '[No text]',
          pfp: '',
          isFromPage: false,
          timestamp: msg.created_time
        };
      }
    }));

    res.json({ messages: messages.reverse() });
  } catch (err) {
    console.error('🔥 Messenger messages error:', serializeError(err));
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Fixed Messenger message sending
app.post('/api/messenger/send', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { id, message } = req.body;
    const page = await getPageAccessToken(req.user.accessToken);
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    // Get conversation participants to find recipient
    const convoResponse = await axios.get(`https://graph.facebook.com/${id}`, {
      params: {
        fields: 'participants',
        access_token: page.access_token
      }
    });

    const recipient = convoResponse.data.participants?.data?.find(p => p.id !== page.id);
    if (!recipient) {
      return res.status(400).json({ error: 'Recipient not found' });
    }

    // Send message using the correct Facebook API endpoint
    const result = await axios.post(`https://graph.facebook.com/v19.0/me/messages`, {
      recipient: { id: recipient.id },
      message: { text: message }
    }, {
      headers: {
        'Authorization': `Bearer ${page.access_token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`✅ Messenger message sent to ${recipient.id}`);
    res.json({ success: true, data: result.data });
  } catch (err) {
    console.error('🔥 Messenger send error:', serializeError(err));
    
    let errorMessage = 'Failed to send message';
    if (err.response && err.response.data && err.response.data.error) {
      errorMessage = err.response.data.error.message || errorMessage;
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

// WHATSAPP ROUTES

app.get('/whatsapp-setup', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>WhatsApp Setup - Work</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; }
        .card { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .form-group { margin-bottom: 20px; }
        .form-group label { display: block; margin-bottom: 8px; font-weight: 600; }
        .form-group input, .form-group textarea { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 6px; }
        .btn { padding: 12px 24px; background: #25D366; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; }
        .btn:hover { background: #128C7E; }
        .webhook-info { background: #e3f2fd; padding: 15px; border-radius: 8px; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <h1>📱 WhatsApp Business API Setup</h1>
          <p>Configure your WhatsApp Business API with AI automation</p>
          <a href="/dashboard" class="btn" style="background: #667eea;">← Back to Dashboard</a>
        </div>
        
        <div class="card">
          <h3>AI Configuration</h3>
          <div class="form-group">
            <label>Gemini API Key:</label>
            <input type="password" id="gemini-key" placeholder="Your Gemini API key">
            <small>Get your API key from <a href="https://ai.google.dev/" target="_blank">Google AI Studio</a></small>
          </div>
          
          <div class="form-group">
            <label>WhatsApp Access Token:</label>
            <input type="password" id="wa-token" placeholder="Your WhatsApp API token">
            <small>Get this from your Facebook Developer Console</small>
          </div>
          
          <div class="form-group">
            <label>System Prompt (AI Personality):</label>
            <textarea id="system-prompt" rows="4" placeholder="You are a helpful customer service assistant. Be friendly and concise in your responses."></textarea>
          </div>
          
          <button onclick="saveAIConfig()" class="btn">Save AI Configuration</button>
          
          <div class="webhook-info">
            <h4>Webhook Configuration</h4>
            <p><strong>Webhook URL:</strong> ${req.protocol}://${req.get('host')}/webhook/whatsapp</p>
            <p><strong>Verify Token:</strong> ${config.whatsapp.verifyToken}</p>
            <p>Add these to your WhatsApp Business API configuration in Facebook Developer Console.</p>
          </div>
        </div>
        
        <div class="card">
          <h3>Test Message</h3>
          <div class="form-group">
            <label>Phone Number (with country code):</label>
            <input type="text" id="test-phone" placeholder="e.g., 919876543210">
          </div>
          
          <div class="form-group">
            <label>Test Message:</label>
            <textarea id="test-message" rows="3" placeholder="Hello! This is a test message from Work Automation."></textarea>
          </div>
          
          <button onclick="sendTestMessage()" class="btn">Send Test Message</button>
        </div>
        
        <div class="card">
          <h3>WhatsApp Dashboard</h3>
          <a href="/whatsapp-dashboard" class="btn">Go to WhatsApp Dashboard</a>
        </div>
      </div>
      
      <script>
        async function saveAIConfig() {
          const geminiKey = document.getElementById('gemini-key').value;
          const waToken = document.getElementById('wa-token').value;
          const systemPrompt = document.getElementById('system-prompt').value;
          
          if (!geminiKey || !waToken) {
            alert('Please provide both Gemini API key and WhatsApp token');
            return;
          }
          
          try {
            const response = await fetch('/api/whatsapp/config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ geminiKey, waToken, systemPrompt })
            });
            
            if (response.ok) {
              alert('AI configuration saved successfully!');
            } else {
              throw new Error('Failed to save configuration');
            }
          } catch (error) {
            alert('Error saving configuration: ' + error.message);
          }
        }
        
        async function sendTestMessage() {
          const phone = document.getElementById('test-phone').value;
          const message = document.getElementById('test-message').value;
          const waToken = document.getElementById('wa-token').value;
          
          if (!phone || !message || !waToken) {
            alert('Please fill all fields and save configuration first');
            return;
          }
          
          try {
            const response = await fetch('/api/whatsapp/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: waToken, to: phone, message })
            });
            
            if (response.ok) {
              alert('Test message sent successfully!');
            } else {
              const error = await response.json();
              throw new Error(error.error || 'Failed to send message');
            }
          } catch (error) {
            alert('Error sending message: ' + error.message);
          }
        }
      </script>
    </body>
    </html>
  `);
});

app.get('/whatsapp-dashboard', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>WhatsApp Dashboard - Work</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .message { padding: 10px; margin: 5px 0; border-radius: 8px; }
        .message.in { background: #e8f5e8; }
        .message.out { background: #e3f2fd; text-align: right; }
        .btn { padding: 10px 20px; background: #25D366; color: white; border: none; border-radius: 5px; cursor: pointer; text-decoration: none; display: inline-block; }
        .btn:hover { background: #128C7E; }
        #messages-container { height: 400px; overflow-y: auto; border: 1px solid #eee; padding: 15px; border-radius: 8px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📱 WhatsApp AI Dashboard</h1>
          <p>Monitor and manage your WhatsApp automation</p>
          <a href="/dashboard" class="btn" style="background: #667eea;">← Back to Dashboard</a>
          <a href="/whatsapp-setup" class="btn">⚙️ Settings</a>
        </div>
        
        <div class="grid">
          <div class="card">
            <h3>Live Messages</h3>
            <div id="messages-container">
              <p>Waiting for messages...</p>
            </div>
          </div>
          
          <div class="card">
            <h3>Quick Actions</h3>
            <div style="margin-bottom: 20px;">
              <h4>Send Manual Message</h4>
              <input type="text" id="manual-phone" placeholder="Phone number" style="width: 100%; padding: 8px; margin-bottom: 10px; border: 1px solid #ddd; border-radius: 4px;">
              <textarea id="manual-message" placeholder="Message" rows="3" style="width: 100%; padding: 8px; margin-bottom: 10px; border: 1px solid #ddd; border-radius: 4px;"></textarea>
              <button onclick="sendManualMessage()" class="btn">Send Message</button>
            </div>
            
            <div>
              <h4>Statistics</h4>
              <p>Messages received today: <span id="messages-received">0</span></p>
              <p>AI responses sent: <span id="ai-responses">0</span></p>
              <p>System status: <span id="system-status" style="color: green;">Active</span></p>
            </div>
          </div>
        </div>
      </div>
      
      <script src="/socket.io/socket.io.js"></script>
      <script>
        const socket = io();
        let messageCount = 0;
        let responseCount = 0;
        
        socket.on('whatsapp-message', (data) => {
          addMessageToContainer(data);
          if (data.direction === 'in') {
            messageCount++;
            document.getElementById('messages-received').textContent = messageCount;
          } else {
            responseCount++;
            document.getElementById('ai-responses').textContent = responseCount;
          }
        });
        
        function addMessageToContainer(data) {
          const container = document.getElementById('messages-container');
          const messageDiv = document.createElement('div');
          messageDiv.className = \`message \${data.direction}\`;
          messageDiv.innerHTML = \`
            <strong>\${data.from}:</strong> \${data.text}
            <small style="display: block; opacity: 0.7;">\${new Date().toLocaleTimeString()}</small>
          \`;
          container.appendChild(messageDiv);
          container.scrollTop = container.scrollHeight;
          
          // Keep only last 50 messages
          while (container.children.length > 50) {
            container.removeChild(container.firstChild);
          }
        }
        
        async function sendManualMessage() {
          const phone = document.getElementById('manual-phone').value;
          const message = document.getElementById('manual-message').value;
          
          if (!phone || !message) {
            alert('Please provide phone number and message');
            return;
          }
          
          try {
            const response = await fetch('/api/whatsapp/send-manual', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ to: phone, message })
            });
            
            if (response.ok) {
              alert('Message sent successfully!');
              document.getElementById('manual-phone').value = '';
              document.getElementById('manual-message').value = '';
            } else {
              const error = await response.json();
              throw new Error(error.error || 'Failed to send message');
            }
          } catch (error) {
            alert('Error: ' + error.message);
          }
        }
        
        // Clear the waiting message after 2 seconds
        setTimeout(() => {
          const container = document.getElementById('messages-container');
          if (container.children.length === 1 && container.textContent.includes('Waiting')) {
            container.innerHTML = '<p style="color: #666;">No messages yet. WhatsApp automation is ready!</p>';
          }
        }, 2000);
      </script>
    </body>
    </html>
  `);
});

// WhatsApp API endpoints
app.post('/api/whatsapp/config', (req, res) => {
  try {
    assignedAI.key = req.body.geminiKey;
    assignedAI.systemPrompt = req.body.systemPrompt || '';
    assignedAI.waToken = req.body.waToken || '';
    
    console.log('✅ WhatsApp AI Configuration Updated:');
    console.log('  System Prompt:', assignedAI.systemPrompt ? 'Set' : 'Not set');
    console.log('  Gemini Key:', assignedAI.key ? 'Set' : 'Not set');
    console.log('  WhatsApp Token:', assignedAI.waToken ? 'Set' : 'Not set');
    
    res.json({ success: true });
  } catch (error) {
    console.error('🔥 WhatsApp config error:', error);
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

app.post('/api/whatsapp/send', async (req, res) => {
  try {
    const { token, to, message } = req.body;
    
    const response = await axios.post(
      `https://graph.facebook.com/v17.0/${config.whatsapp.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: message }
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`✅ WhatsApp message sent to ${to}`);
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error('🔥 WhatsApp send error:', serializeError(error));
    const errorMessage = error.response?.data?.error?.message || error.message || 'Failed to send message';
    res.status(500).json({ success: false, error: errorMessage });
  }
});

app.post('/api/whatsapp/send-manual', async (req, res) => {
  try {
    const { to, message } = req.body;
    
    if (!assignedAI.waToken) {
      return res.status(400).json({ error: 'WhatsApp token not configured' });
    }
    
    const response = await axios.post(
      `https://graph.facebook.com/v17.0/${config.whatsapp.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: message }
      },
      {
        headers: {
          'Authorization': `Bearer ${assignedAI.waToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`✅ Manual WhatsApp message sent to ${to}`);
    
    // Emit to dashboard
    if (frontendSocket) {
      frontendSocket.emit('whatsapp-message', {
        from: 'You',
        text: message,
        direction: 'out'
      });
    }
    
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error('🔥 WhatsApp manual send error:', serializeError(error));
    const errorMessage = error.response?.data?.error?.message || error.message || 'Failed to send message';
    res.status(500).json({ success: false, error: errorMessage });
  }
});

// WEBHOOK ROUTES

// Instagram webhook
app.get('/webhook/instagram', (req, res) => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log('🔔 Instagram webhook verification:', req.query);

    if (mode === 'subscribe' && token === config.webhook.verifyToken) {
      console.log('✅ Instagram webhook verified');
      res.status(200).send(challenge);
    } else {
      console.error(`❌ Instagram webhook verification failed. Expected: ${config.webhook.verifyToken}, Got: ${token}`);
      res.sendStatus(403);
    }
  } catch (err) {
    console.error('🔥 Instagram webhook verification error:', serializeError(err));
    res.sendStatus(500);
  }
});

app.post('/webhook/instagram', async (req, res) => {
  try {
    console.log('📩 Instagram webhook event:', JSON.stringify(req.body, null, 2));
    const { object, entry } = req.body;

    if (object === 'instagram') {
      for (const event of entry) {
        if (event.changes && event.changes[0].field === 'comments') {
          const commentData = event.changes[0].value;
          await handleInstagramCommentEvent(commentData);
        }
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('🔥 Instagram webhook processing error:', serializeError(err));
    res.status(500).json({ error: 'Server error' });
  }
});

// WhatsApp webhook
app.get('/webhook/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  console.log('🔔 WhatsApp webhook verification:', req.query);
  
  if (mode && token === config.whatsapp.verifyToken) {
    console.log('✅ WhatsApp webhook verified');
    res.status(200).send(challenge);
  } else {
    console.error(`❌ WhatsApp webhook verification failed. Expected: ${config.whatsapp.verifyToken}, Got: ${token}`);
    res.sendStatus(403);
  }
});

app.post('/webhook/whatsapp', async (req, res) => {
  try {
    console.log('📩 WhatsApp webhook event:', JSON.stringify(req.body, null, 2));
    
    const entry = req.body.entry?.[0];
    const messageObj = entry?.changes?.[0]?.value?.messages?.[0];
    const from = messageObj?.from;
    const text = messageObj?.text?.body;

    if (messageObj && from && text) {
      console.log(`📥 WhatsApp message from ${from}: ${text}`);

      // Emit to frontend dashboard
      if (frontendSocket) {
        frontendSocket.emit('whatsapp-message', { 
          from: from, 
          text: text, 
          direction: 'in' 
        });
      }

      // AI auto-response if configured
      if (assignedAI.key && assignedAI.waToken) {
        // Save user message to memory
        whatsappMemory[from] = whatsappMemory[from] || [];
        whatsappMemory[from].push({ role: 'user', text });

        // Get AI reply
        const aiReply = await getGeminiReply(from, assignedAI.systemPrompt, assignedAI.key);
        if (aiReply) {
          await sendWhatsAppAutoReply(from, aiReply, assignedAI.waToken);

          // Save AI reply to memory
          whatsappMemory[from].push({ role: 'model', text: aiReply });

          // Emit AI response to frontend
          if (frontendSocket) {
            frontendSocket.emit('whatsapp-message', {
              from: '🤖 AI Assistant',
              text: aiReply,
              direction: 'out'
            });
          }
        }
      } else {
        console.warn('⚠️ WhatsApp AI not configured - no auto-reply sent');
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('🔥 WhatsApp webhook processing error:', serializeError(err));
    res.status(500).json({ error: 'Server error' });
  }
});

// Messenger webhook
app.get('/webhook/messenger', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  console.log('🔔 Messenger webhook verification:', req.query);
  
  if (mode && token === config.webhook.verifyToken) {
    console.log('✅ Messenger webhook verified');
    res.status(200).send(challenge);
  } else {
    console.error(`❌ Messenger webhook verification failed. Expected: ${config.webhook.verifyToken}, Got: ${token}`);
    res.sendStatus(403);
  }
});

app.post('/webhook/messenger', (req, res) => {
  try {
    console.log('📩 Messenger webhook event:', JSON.stringify(req.body, null, 2));
    
    // Verify the webhook signature
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) {
      console.warn('⚠️ Missing Messenger webhook signature');
      return res.sendStatus(400);
    }
    
    // Process the webhook event
    const body = req.body;
    if (body.object === 'page') {
      body.entry.forEach(entry => {
        entry.messaging && entry.messaging.forEach(event => {
          console.log('💬 Messenger event:', event);
          
          // Forward to frontend
          if (frontendSocket) {
            frontendSocket.emit('messenger-event', event);
          }
        });
      });
    }
    
    res.sendStatus(200);
  } catch (err) {
    console.error('🔥 Messenger webhook processing error:', serializeError(err));
    res.status(500).json({ error: 'Server error' });
  }
});

// EVENT HANDLERS

async function handleInstagramCommentEvent(commentData) {
  try {
    const { media_id, text, username } = commentData;
    console.log(`💬 Instagram comment from ${username} on post ${media_id}: ${text}`);

    for (const [userId, config] of configurations.entries()) {
      try {
        if (media_id !== config.postId) continue;

        const user = users.get(userId);
        if (!user) continue;

        if (text.toLowerCase().includes(config.keyword.toLowerCase())) {
          console.log(`🔑 Keyword "${config.keyword}" matched in comment by ${username}`);
          
          const messageText = config.response.replace(/{username}/g, username);
          console.log(`✉️ Sending Instagram DM to ${username}: ${messageText.substring(0, 50)}...`);
          
          // Use the correct Instagram messaging endpoint
          await axios.post(`https://graph.facebook.com/v19.0/${user.instagram_id}/messages`, {
            recipient: { username: username },
            message: { text: messageText }
          }, {
            headers: {
              'Authorization': `Bearer ${user.access_token}`,
              'Content-Type': 'application/json'
            },
            timeout: 15000
          });

          console.log(`✅ Instagram DM sent to ${username} for keyword "${config.keyword}"`);
        }
      } catch (err) {
        console.error(`🔥 Instagram comment handling error for user ${userId}:`, serializeError(err));
      }
    }
  } catch (err) {
    console.error('🔥 Instagram event processing error:', serializeError(err));
  }
}

async function getGeminiReply(userId, userSysPrompt, apiKey) {
  try {
    const permanentSysPrompt = "You are a helpful sales AI bot. Answer everything briefly and you are handling users on WhatsApp. Be friendly and concise.";
    const fullPrompt = userSysPrompt ? `${permanentSysPrompt}\n${userSysPrompt}` : permanentSysPrompt;

    const history = whatsappMemory[userId] || [];
    const contents = [
      { role: 'user', parts: [{ text: fullPrompt }] },
      ...history.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }))
    ];

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      { contents },
      { 
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      }
    );

    const reply = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return reply || 'I apologize, but I cannot respond right now. Please try again later.';
  } catch (err) {
    console.error('⚠️ Gemini API error:', err.response?.data || err.message);
    return 'I apologize, but I cannot respond right now. Please try again later.';
  }
}

async function sendWhatsAppAutoReply(to, text, token) {
  try {
    await axios.post(
      `https://graph.facebook.com/v17.0/${config.whatsapp.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: text }
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`🤖 WhatsApp auto-reply sent to ${to}: ${text.substring(0, 50)}...`);
  } catch (err) {
    console.error('❌ WhatsApp auto-reply failed:', err.response?.data || err.message);
  }
}

// AUTH ROUTES
app.get('/auth/logout', (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    res.redirect('/');
  });
});

// DEBUG AND HEALTH ROUTES
app.get('/debug', (req, res) => {
  try {
    res.json({
      status: 'running',
      environment: process.env.NODE_ENV || 'development',
      instagram: {
        app_id: config.instagram.appId,
        users_count: users.size,
        configs_count: configurations.size
      },
      facebook: {
        app_id: config.facebook.appId
      },
      whatsapp: {
        phone_number_id: config.whatsapp.phoneNumberId,
        ai_configured: !!(assignedAI.key && assignedAI.waToken)
      },
      server_time: new Date().toISOString(),
      uptime: process.uptime()
    });
  } catch (err) {
    console.error('🔥 Debug endpoint error:', serializeError(err));
    res.status(500).json({ error: 'Debug information unavailable' });
  }
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    version: '2.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// USER INFO ROUTE
app.get('/api/user-info', (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    const user = users.get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      username: user.username,
      instagram_id: user.instagram_id,
      profile_pic: user.profile_pic,
      platform: user.platform,
      last_login: user.last_login
    });
  } catch (err) {
    console.error('🔥 User info error:', serializeError(err));
    res.status(500).json({ error: 'Server error' });
  }
});

// ERROR HANDLING MIDDLEWARE
app.use((err, req, res, next) => {
  console.error('🔥 Global error handler:', serializeError(err));
  res.status(500).json({ error: 'Internal server error' });
});

// 404 HANDLER
app.use((req, res) => {
  res.status(404).send(`
    <div style="font-family: sans-serif; text-align: center; padding: 50px;">
      <h1>404 - Page Not Found</h1>
      <p>The page you're looking for doesn't exist.</p>
      <a href="/" style="color: #667eea;">← Go back to home</a>
    </div>
  `);
});

// START SERVER
server.listen(PORT, () => {
  console.log('=====================================');
  console.log(`🚀 Work Automation Platform Started`);
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🔗 Instagram Redirect: ${config.instagram.redirectUri}`);
  console.log(`🔗 Facebook Callback: ${config.facebook.callbackUrl}`);
  
  if (process.env.RENDER_EXTERNAL_HOSTNAME) {
    console.log(`🌐 Live at: https://${process.env.RENDER_EXTERNAL_HOSTNAME}`);
  }
  
  console.log('=====================================');
  console.log('✅ Platforms Ready:');
  console.log('   📸 Instagram - Comment & DM automation');
  console.log('   💬 Facebook Messenger - Chat management'); 
  console.log('   📱 WhatsApp - AI-powered responses');
  console.log('=====================================');
});
