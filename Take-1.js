require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const FacebookStrategy = require('passport-facebook').Strategy;
const axios = require('axios');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Environment configuration
const PORT = process.env.PORT || 10000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'workflow_secret_key';

// Instagram config
const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID;
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET;
const INSTAGRAM_REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI || `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/instagram/auth/callback`;
const IG_WEBHOOK_VERIFY_TOKEN = process.env.IG_WEBHOOK_VERIFY_TOKEN || 'WORKFLOW_VERIFY_TOKEN';

// Facebook config
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const FACEBOOK_CALLBACK_URL = process.env.FACEBOOK_CALLBACK_URL || `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/facebook/login/callback`;

// WhatsApp config
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'verify-me';

// State management
const instagramUsers = new Map();
const instagramConfigs = new Map();
const usedAuthCodes = new Set();
let whatsappState = {
  frontendSocket: null,
  assignedAI: { key: '', systemPrompt: '', waToken: '' },
  memory: {}
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

// Passport configuration
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new FacebookStrategy({
  clientID: FACEBOOK_APP_ID,
  clientSecret: FACEBOOK_APP_SECRET,
  callbackURL: FACEBOOK_CALLBACK_URL,
  profileFields: ['id', 'displayName', 'emails'],
  scope: ['pages_show_list', 'pages_messaging', 'pages_manage_metadata', 'pages_read_engagement']
}, (accessToken, refreshToken, profile, done) => {
  profile.accessToken = accessToken;
  return done(null, profile);
}));

// Helper functions
function serializeError(err) {
  if (!err) return 'Unknown error';
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

// ------------------------------
// INSTAGRAM ROUTES
// ------------------------------
app.get('/instagram/auth', (req, res) => {
  const authUrl = `https://www.instagram.com/oauth/authorize?force_reauth=true&client_id=${INSTAGRAM_APP_ID}&redirect_uri=${encodeURIComponent(INSTAGRAM_REDIRECT_URI)}&response_type=code&scope=instagram_business_basic%2Cinstagram_business_manage_messages%2Cinstagram_business_manage_comments%2Cinstagram_business_content_publish%2Cinstagram_business_manage_insights`;
  res.redirect(authUrl);
});

app.get('/instagram/auth/callback', async (req, res) => {
  try {
    const { code, error } = req.query;
    if (error) throw new Error(`OAuth error: ${error}`);
    if (!code) throw new Error('Authorization code missing');

    if (usedAuthCodes.has(code)) {
      return res.redirect('/instagram/login?error=code_reused');
    }
    usedAuthCodes.add(code);

    const tokenData = new URLSearchParams();
    tokenData.append('client_id', INSTAGRAM_APP_ID);
    tokenData.append('client_secret', INSTAGRAM_APP_SECRET);
    tokenData.append('grant_type', 'authorization_code');
    tokenData.append('redirect_uri', INSTAGRAM_REDIRECT_URI);
    tokenData.append('code', code);

    const tokenResponse = await axios.post(
      'https://api.instagram.com/oauth/access_token',
      tokenData,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
    );

    const accessToken = tokenResponse.data.access_token;
    const userId = String(tokenResponse.data.user_id);

    const profileResponse = await axios.get(`https://graph.instagram.com/me`, {
      params: { fields: 'id,username,profile_picture_url', access_token: accessToken },
      timeout: 20000
    });

    instagramUsers.set(userId, {
      access_token: accessToken,
      username: profileResponse.data.username,
      profile_pic: profileResponse.data.profile_picture_url,
      instagram_id: userId
    });

    res.redirect(`/instagram/dashboard?user_id=${userId}`);
  } catch (err) {
    console.error('Instagram auth error:', serializeError(err));
    res.redirect(`/instagram/login?error=auth_failed`);
  }
});

// FIXED: Instagram message sending
app.post('/instagram/send-message', async (req, res) => {
  try {
    const { userId, username, message } = req.body;
    const user = instagramUsers.get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Get page ID first
    const pagesResponse = await axios.get(`https://graph.facebook.com/v19.0/me/accounts`, {
      headers: { Authorization: `Bearer ${user.access_token}` }
    });

    if (!pagesResponse.data.data || pagesResponse.data.data.length === 0) {
      throw new Error('No Facebook pages found');
    }

    const pageId = pagesResponse.data.data[0].id;
    const pageAccessToken = pagesResponse.data.data[0].access_token;

    // Get Instagram business account ID
    const igAccountResponse = await axios.get(`https://graph.facebook.com/v19.0/${pageId}`, {
      params: { fields: 'instagram_business_account' },
      headers: { Authorization: `Bearer ${pageAccessToken}` }
    });

    const igBusinessId = igAccountResponse.data.instagram_business_account.id;

    // Send message
    await axios.post(`https://graph.facebook.com/v19.0/${igBusinessId}/messages`, {
      recipient: { username },
      message: { text: message }
    }, {
      headers: {
        'Authorization': `Bearer ${pageAccessToken}`,
        'Content-Type': 'application/json'
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Instagram message error:', serializeError(err));
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ------------------------------
// FACEBOOK MESSENGER ROUTES
// ------------------------------
async function getPageAccessToken(userToken) {
  try {
    const resp = await axios.get(`https://graph.facebook.com/me/accounts?access_token=${userToken}`);
    return resp.data?.data?.[0] || null;
  } catch (err) {
    console.error("Page token error:", serializeError(err));
    return null;
  }
}

app.get('/facebook/login', passport.authenticate('facebook'));

app.get('/facebook/login/callback', passport.authenticate('facebook', { 
  failureRedirect: '/facebook/login/fail' 
}), (req, res) => {
  res.redirect('/facebook/dashboard');
});

// FIXED: Messenger message sending
app.post('/facebook/send-message', async (req, res) => {
  try {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    
    const { conversationId, message } = req.body;
    const page = await getPageAccessToken(req.user.accessToken);
    
    if (!page) return res.status(404).json({ error: 'Page not found' });

    await axios.post(`https://graph.facebook.com/v19.0/me/messages`, {
      recipient: { id: conversationId },
      message: { text: message }
    }, {
      params: { access_token: page.access_token },
      headers: { 'Content-Type': 'application/json' }
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Messenger send error:', serializeError(err));
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ------------------------------
// WHATSAPP ROUTES
// ------------------------------
io.on('connection', (socket) => {
  whatsappState.frontendSocket = socket;
  socket.on('disconnect', () => {
    whatsappState.frontendSocket = null;
  });
});

app.post('/whatsapp/assign-ai', (req, res) => {
  whatsappState.assignedAI = {
    key: req.body.geminiKey,
    systemPrompt: req.body.systemPrompt || '',
    waToken: req.body.waToken || ''
  };
  res.sendStatus(200);
});

app.get('/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/whatsapp/webhook', async (req, res) => {
  const entry = req.body.entry?.[0];
  const messageObj = entry?.changes?.[0]?.value?.messages?.[0];
  const from = messageObj?.from;
  const text = messageObj?.text?.body;

  if (from && text) {
    // Forward to frontend
    if (whatsappState.frontendSocket) {
      whatsappState.frontendSocket.emit('message', { from, text, direction: 'in' });
    }

    // Auto-reply with AI
    if (whatsappState.assignedAI.key && whatsappState.assignedAI.waToken) {
      const aiReply = await getGeminiReply(from, text, whatsappState);
      await sendWhatsAppMessage(from, aiReply, whatsappState.assignedAI.waToken);
      
      if (whatsappState.frontendSocket) {
        whatsappState.frontendSocket.emit('message', {
          from: '🤖 Gemini',
          text: aiReply,
          direction: 'out'
        });
      }
    }
  }
  res.sendStatus(200);
});

async function getGeminiReply(userId, text, state) {
  try {
    state.memory[userId] = state.memory[userId] || [];
    state.memory[userId].push({ role: 'user', text });

    const prompt = state.assignedAI.systemPrompt || 
                  "You are a helpful WhatsApp assistant. Respond concisely.";
    
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${state.assignedAI.key}`,
      {
        contents: [{
          parts: [{ text: `${prompt}\n\nUser: ${text}` }]
        }]
      }
    );

    const reply = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "I didn't understand that";
    state.memory[userId].push({ role: 'model', text: reply });
    return reply;
  } catch (err) {
    console.error('Gemini error:', serializeError(err));
    return "Sorry, I encountered an error";
  }
}

async function sendWhatsAppMessage(to, text, token) {
  try {
    await axios.post(
      'https://graph.facebook.com/v17.0/657991800734493/messages',
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (err) {
    console.error('WhatsApp send error:', serializeError(err));
  }
}

// ------------------------------
// UNIFIED DASHBOARD
// ------------------------------
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ------------------------------
// SERVER START
// ------------------------------
server.listen(PORT, () => {
  console.log(`
  ===========================================
  🚀 WORKFLOW SAAS PLATFORM RUNNING ON PORT ${PORT}
  ===========================================
  Instagram: ${INSTAGRAM_APP_ID ? '✅ Configured' : '❌ Disabled'}
  Facebook:  ${FACEBOOK_APP_ID ? '✅ Configured' : '❌ Disabled'}
  WhatsApp:  ${WHATSAPP_VERIFY_TOKEN ? '✅ Configured' : '❌ Disabled'}
  ===========================================
  `);
});
