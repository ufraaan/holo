package server

import (
	"net/http"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait  = 30 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = (pongWait * 9) / 10
	// Allow reasonably large JSON-wrapped, base64-encoded chunks without tripping the limit.
	// The actual file chunk size is controlled on the client; this just caps any single WS frame.
	maxMessageSize = 2 * 1024 * 1024 // 2 MiB
)

var upgrader = websocket.Upgrader{
	// Match the front-end chunk size so the library doesn't need to
	// grow its internal buffers for every file-chunk frame.
	ReadBufferSize:  65536,
	WriteBufferSize: 65536,
	CheckOrigin: func(r *http.Request) bool {
		// Frontend should be served from a trusted origin in production.
		return true
	},
}

// Client represents a single WebSocket connection.
type Client struct {
	hub    *Hub
	conn   *websocket.Conn
	send   chan []byte
	roomID string
	id     string
}

// NewWSHandler constructs an HTTP handler that upgrades to WebSockets.
func NewWSHandler(hub *Hub) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		roomID := r.URL.Query().Get("roomId")
		clientID := r.URL.Query().Get("clientId")

		if roomID == "" || clientID == "" {
			logError("ws_missing_identifiers", logFields{
				"remoteAddr": r.RemoteAddr,
				"roomId":     roomID,
				"clientId":   clientID,
			})
			http.Error(w, "missing roomId or clientId", http.StatusBadRequest)
			return
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			logError("ws_upgrade_error", logFields{
				"remoteAddr": r.RemoteAddr,
				"roomId":     roomID,
				"clientId":   clientID,
				"error":      err.Error(),
			})
			return
		}

		client := &Client{
			hub:    hub,
			conn:   conn,
			send:   make(chan []byte, 64),
			roomID: roomID,
			id:     clientID,
		}

		logInfo("ws_client_connected", logFields{
			"remoteAddr": r.RemoteAddr,
			"roomId":     roomID,
			"clientId":   clientID,
		})

		hub.register <- client

		go client.writePump()
		go client.readPump()
	})
}

// readPump reads messages from the WebSocket connection and forwards them to the room.
func (c *Client) readPump() {
	defer func() {
		logInfo("ws_read_pump_closed", logFields{
			"clientId": c.id,
			"roomId":   c.roomID,
		})
		c.hub.unregister <- c
		_ = c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(pongWait))
	})

	for {
		msgType, message, err := c.conn.ReadMessage()
		if err != nil {
			if ce, ok := err.(*websocket.CloseError); ok {
				logInfo("ws_close", logFields{
					"clientId": c.id,
					"roomId":   c.roomID,
					"code":     ce.Code,
					"text":     ce.Text,
				})
			} else if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				logError("ws_unexpected_close", logFields{
					"clientId": c.id,
					"roomId":   c.roomID,
					"error":    err.Error(),
				})
			} else {
				logInfo("ws_read_error", logFields{
					"clientId": c.id,
					"roomId":   c.roomID,
					"error":    err.Error(),
				})
			}
			break
		}
		if msgType != websocket.TextMessage && msgType != websocket.BinaryMessage {
			continue
		}
		// The server is a relay; we don't inspect the payload.
		c.hub.Broadcast(c.roomID, c, message)
	}
}

// writePump writes messages from the hub to the WebSocket connection.
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		logInfo("ws_write_pump_closed", logFields{
			"clientId": c.id,
			"roomId":   c.roomID,
		})
		ticker.Stop()
		_ = c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub closed the channel.
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.BinaryMessage)
			if err != nil {
				return
			}
			if _, err := w.Write(message); err != nil {
				_ = w.Close()
				return
			}
			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
