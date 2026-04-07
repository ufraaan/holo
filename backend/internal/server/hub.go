package server

import (
	"encoding/json"
	"sync"
	"time"
)

// Hub manages rooms and garbage collection.
type Hub struct {
	rooms       map[string]*Room
	mu          sync.RWMutex
	register    chan *Client
	unregister  chan *Client
	inactivity  time.Duration
	gcTickerDur time.Duration
}

func NewHub(inactivity time.Duration) *Hub {
	return &Hub{
		rooms:       make(map[string]*Room),
		register:    make(chan *Client),
		unregister:  make(chan *Client),
		inactivity:  inactivity,
		gcTickerDur: time.Minute,
	}
}

func (h *Hub) Run() {
	ticker := time.NewTicker(h.gcTickerDur)
	defer ticker.Stop()

	for {
		select {
		case c := <-h.register:
			h.addClient(c)
		case c := <-h.unregister:
			h.removeClient(c)
		case <-ticker.C:
			h.gcRooms()
		}
	}
}

func (h *Hub) addClient(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	room, ok := h.rooms[c.roomID]
	if !ok {
		room = NewRoom(c.roomID)
		h.rooms[c.roomID] = room
	}
	room.AddClient(c)
	h.broadcastRoomState(room)
	logInfo("client_joined", logFields{
		"roomId":      c.roomID,
		"clientId":    c.id,
		"clientCount": room.ClientCount(),
	})
}

func (h *Hub) removeClient(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	room, ok := h.rooms[c.roomID]
	if !ok {
		return
	}
	room.RemoveClient(c)
	h.broadcastRoomState(room)
	logInfo("client_left", logFields{
		"roomId":      c.roomID,
		"clientId":    c.id,
		"clientCount": room.ClientCount(),
	})
	if room.ClientCount() == 0 {
		delete(h.rooms, c.roomID)
	}
}

func (h *Hub) broadcastRoomState(room *Room) {
	msg, err := json.Marshal(struct {
		Type    string `json:"type"`
		Payload struct {
			ClientCount int `json:"clientCount"`
		} `json:"payload"`
	}{
		Type: "room-state",
		Payload: struct {
			ClientCount int `json:"clientCount"`
		}{
			ClientCount: room.ClientCount(),
		},
	})
	if err != nil {
		logError("room_state_marshal_error", logFields{
			"roomId": room.id,
			"error":  err.Error(),
		})
		return
	}
	room.BroadcastAll(msg)
}

func (h *Hub) Broadcast(roomID string, sender *Client, message []byte) {
	h.mu.RLock()
	room, ok := h.rooms[roomID]
	h.mu.RUnlock()
	if !ok {
		return
	}
	room.Broadcast(sender, message)
}

func (h *Hub) gcRooms() {
	now := time.Now()

	// Identify stale rooms and remove them from the map while holding the
	// hub lock.  Closing connections is deferred until after the lock is
	// released so that in-flight Broadcast calls are not blocked for the
	// entire duration of the cleanup.
	h.mu.Lock()
	var toEvict []*Room
	for id, room := range h.rooms {
		if now.Sub(room.LastActivity()) > h.inactivity || room.ClientCount() == 0 {
			toEvict = append(toEvict, room)
			delete(h.rooms, id)
		}
	}
	h.mu.Unlock()

	for _, room := range toEvict {
		logInfo("room_gc", logFields{
			"roomId":     room.id,
			"lastActive": room.LastActivity(),
		})
		room.CloseAll()
	}
}
