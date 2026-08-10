const EVENT_CONTRACT = {
  namespace: '/ws',
  description: 'Documented WebSocket event contract for Section 19 (Secure Real-Time Chat) and Section 20 (Calling). No live socket.io server is mounted yet; this module is a placeholder contract consumed by REST fallbacks.',
  client_to_server: {
    'conversation:join': { conversation_id: 'string' },
    'conversation:leave': { conversation_id: 'string' },
    'message:send': {
      conversation_id: 'string',
      client_message_id: 'string',
      body: 'string',
      attachment_url: 'string|null',
      message_type: 'text|attachment|system|clinical_note'
    },
    'message:read': { conversation_id: 'string', message_id: 'string' },
    'typing:start': { conversation_id: 'string' },
    'typing:stop': { conversation_id: 'string' },
    'call:signal': {
      call_id: 'string',
      to_user_id: 'string',
      signal_type: 'offer|answer|ice_candidate',
      payload: 'object'
    },
    'call:join': { call_id: 'string' },
    'call:leave': { call_id: 'string' }
  },
  server_to_client: {
    'message:new': { message: 'object' },
    'message:status_changed': { message_id: 'string', status: 'sent|delivered|read' },
    'typing:update': { conversation_id: 'string', user_id: 'string', typing: 'boolean' },
    'call:ringing': { call_id: 'string', from_user_id: 'string' },
    'call:signal': {
      call_id: 'string',
      from_user_id: 'string',
      signal_type: 'offer|answer|ice_candidate',
      payload: 'object'
    },
    'call:participant_joined': { call_id: 'string', user_id: 'string' },
    'call:participant_left': { call_id: 'string', user_id: 'string' },
    'call:state_changed': { call_id: 'string', status: 'idle|ringing|connecting|active|reconnecting|ended|failed' }
  }
};

function attachPlaceholder(app) {
  // Documented event contract — the live Socket.IO server is mounted in
  // realtime/signaling.js on the /ws namespace.
  app.get('/api/v1/ws/contract', (req, res) => {
    res.json(EVENT_CONTRACT);
  });
  // Also expose at the unversioned path for convenience
  app.get('/api/ws/contract', (req, res) => {
    res.json(EVENT_CONTRACT);
  });
  app.get('/api/ws/health', (req, res) => {
    const ws = app.get('wsNamespace');
    res.json({
      status: ws ? 'ok' : 'unavailable',
      namespace: '/ws',
      path: '/ws/socket.io',
      connected_sockets: ws ? ws.sockets.size : 0,
    });
  });
}

module.exports = {
  EVENT_CONTRACT,
  attachPlaceholder
};
