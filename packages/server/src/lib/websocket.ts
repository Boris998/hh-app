// src/lib/websocket.ts - Node.js compatible version

import { createWSMessageEvent, type WSContext } from 'hono/ws'

export interface WebSocketMessage {
  type: 'match_update' | 'team_update' | 'player_update' | 'tournament_update' | 'chat_message' | 'notification'
  data: any
  timestamp: string
  userId?: string
  room?: string
}

export interface WebSocketConnection {
  ws: WSContext
  userId?: string
  rooms: Set<string>
}

class WebSocketManager {
  private connections = new Map<string, WebSocketConnection>()
  private rooms = new Map<string, Set<string>>() // room -> connection IDs

  addConnection(id: string, connection: WebSocketConnection) {
    this.connections.set(id, connection)
  }

  removeConnection(id: string) {
    const connection = this.connections.get(id)
    if (connection) {
      // Remove from all rooms
      connection.rooms.forEach(room => {
        this.leaveRoom(id, room)
      })
      this.connections.delete(id)
    }
  }

  joinRoom(connectionId: string, room: string) {
    const connection = this.connections.get(connectionId)
    if (connection) {
      connection.rooms.add(room)
      
      if (!this.rooms.has(room)) {
        this.rooms.set(room, new Set())
      }
      this.rooms.get(room)!.add(connectionId)
    }
  }

  leaveRoom(connectionId: string, room: string) {
    const connection = this.connections.get(connectionId)
    if (connection) {
      connection.rooms.delete(room)
      
      const roomConnections = this.rooms.get(room)
      if (roomConnections) {
        roomConnections.delete(connectionId)
        if (roomConnections.size === 0) {
          this.rooms.delete(room)
        }
      }
    }
  }

  broadcastToRoom(room: string, message: WebSocketMessage) {
    const roomConnections = this.rooms.get(room)
    if (roomConnections) {
      roomConnections.forEach(connectionId => {
        const connection = this.connections.get(connectionId)
        if (connection) {
          connection.ws.send(JSON.stringify(message))
        }
      })
    }
  }

  sendToUser(userId: string, message: WebSocketMessage) {
    for (const [connectionId, connection] of this.connections) {
      if (connection.userId === userId) {
        connection.ws.send(JSON.stringify(message))
      }
    }
  }

  broadcast(message: WebSocketMessage) {
    for (const [connectionId, connection] of this.connections) {
      connection.ws.send(JSON.stringify(message))
    }
  }

  getConnectionsInRoom(room: string): number {
    return this.rooms.get(room)?.size || 0
  }

  getRooms(): string[] {
    return Array.from(this.rooms.keys())
  }
}

export const wsManager = new WebSocketManager()

// For Node.js, we'll use a different approach - no upgradeWebSocket export for now
// We'll implement WebSocket support using a different method later