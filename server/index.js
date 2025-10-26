import http from 'http'
import { connectToDatabase } from './db.js'
import { createApp, registerBroadcaster } from './app.js'
import { WebSocketServer } from 'ws'

const app = createApp()

const PORT = process.env.PORT || 3000

// Start server only after DB is connected
connectToDatabase()
  .then(() => {
    const server = http.createServer(app)

    // Create WebSocket server on path /ws
    const wss = new WebSocketServer({ server, path: '/ws' })

    // Simple broadcaster: send JSON message to all connected clients
    function broadcaster(message) {
      const payload = typeof message === 'string' ? message : JSON.stringify(message)
      for (const client of wss.clients) {
        if (client.readyState === client.OPEN) {
          try {
            client.send(payload)
          } catch (e) {
            // ignore send errors
          }
        }
      }
    }

    // Register broadcaster so app can call it
    registerBroadcaster(broadcaster)

    wss.on('connection', (ws, req) => {
      // Send initial ping so client can fetch state immediately
      try { ws.send(JSON.stringify({ type: 'connected', timestamp: Date.now() })) } catch {}

      ws.on('message', (msg) => {
        // Accept incoming messages from clients for future use (not required now)
        // For now we ignore or could log small debug
        // console.log('WS recv:', msg.toString())
      })

      ws.on('close', () => {
        // client disconnected
      })
    })

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server listening on port ${PORT}`)
    })
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err)
    process.exit(1)
  })
