// packages/server/src/routes/websocket.router.ts
import { Hono } from 'hono'
import { upgradeWebSocket, wsManager, type WebSocketMessage } from '../lib/websocket.js'
import type { AppContext } from '../lib/context.js'
import { generateNanoId } from '../utils/security.js'

export const websocketRouter = new Hono<AppContext>()

// WebSocket endpoint for real-time connections
websocketRouter.get('/ws', upgradeWebSocket((c) => ({
  onOpen: (evt, ws) => {
    const connectionId = generateNanoId()
    console.log(`WebSocket connection opened: ${connectionId}`)
    
    wsManager.addConnection(connectionId, {
      ws,
      rooms: new Set()
    })

    // Send welcome message
    const welcomeMessage: WebSocketMessage = {
      type: 'notification',
      data: { message: 'Connected to Sports API WebSocket' },
      timestamp: new Date().toISOString()
    }
    ws.send(JSON.stringify(welcomeMessage))
  },

  onMessage: (evt, ws) => {
    try {
      const message = JSON.parse(evt.data.toString()) as {
        type: string
        data: any
        room?: string
        userId?: string
      }

      console.log('Received WebSocket message:', message)

      switch (message.type) {
        case 'join_room':
          if (message.room) {
            // Find connection by ws instance
            for (const [connectionId, connection] of wsManager['connections']) {
              if (connection.ws === ws) {
                wsManager.joinRoom(connectionId, message.room)
                
                const response: WebSocketMessage = {
                  type: 'notification',
                  data: { 
                    message: `Joined room: ${message.room}`,
                    room: message.room,
                    connections: wsManager.getConnectionsInRoom(message.room)
                  },
                  timestamp: new Date().toISOString(),
                  room: message.room
                }
                ws.send(JSON.stringify(response))
                break
              }
            }
          }
          break

        case 'leave_room':
          if (message.room) {
            for (const [connectionId, connection] of wsManager['connections']) {
              if (connection.ws === ws) {
                wsManager.leaveRoom(connectionId, message.room)
                
                const response: WebSocketMessage = {
                  type: 'notification',
                  data: { message: `Left room: ${message.room}` },
                  timestamp: new Date().toISOString()
                }
                ws.send(JSON.stringify(response))
                break
              }
            }
          }
          break

        case 'chat_message':
          if (message.room && message.data?.message) {
            const chatMessage: WebSocketMessage = {
              type: 'chat_message',
              data: {
                message: message.data.message,
                userId: message.userId || 'anonymous',
                username: message.data.username || 'Anonymous User'
              },
              timestamp: new Date().toISOString(),
              room: message.room,
              userId: message.userId
            }
            
            wsManager.broadcastToRoom(message.room, chatMessage)
          }
          break

        case 'ping':
          const pongMessage: WebSocketMessage = {
            type: 'notification',
            data: { message: 'pong' },
            timestamp: new Date().toISOString()
          }
          ws.send(JSON.stringify(pongMessage))
          break

        default:
          console.log('Unknown message type:', message.type)
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error)
      
      const errorMessage: WebSocketMessage = {
        type: 'notification',
        data: { error: 'Invalid message format' },
        timestamp: new Date().toISOString()
      }
      ws.send(JSON.stringify(errorMessage))
    }
  },

  onClose: (evt, ws) => {
    console.log('WebSocket connection closed')
    
    // Find and remove connection
    for (const [connectionId, connection] of wsManager['connections']) {
      if (connection.ws === ws) {
        wsManager.removeConnection(connectionId)
        break
      }
    }
  },

  onError: (evt, ws) => {
    console.error('WebSocket error:', evt)
  }
})))

// HTTP endpoints for broadcasting messages
websocketRouter.post('/broadcast', async (c) => {
  const { type, data, room, userId } = await c.req.json()

  const message: WebSocketMessage = {
    type,
    data,
    timestamp: new Date().toISOString(),
    room,
    userId
  }

  if (room) {
    wsManager.broadcastToRoom(room, message)
  } else if (userId) {
    wsManager.sendToUser(userId, message)
  } else {
    wsManager.broadcast(message)
  }

  return c.json({ 
    success: true, 
    message: 'Message broadcasted',
    recipients: room ? wsManager.getConnectionsInRoom(room) : 'all'
  })
})

// Get active rooms and connections info
websocketRouter.get('/stats', (c) => {
  const rooms = wsManager.getRooms().map(room => ({
    name: room,
    connections: wsManager.getConnectionsInRoom(room)
  }))

  return c.json({
    totalConnections: wsManager['connections'].size,
    totalRooms: rooms.length,
    rooms
  })
})