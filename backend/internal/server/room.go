package server

import (
	"sync"
	"sync/atomic"
	"time"
)

// Room is an in-memory collection of clients.
type Room struct {
	id           string
	clients      map[*Client]struct{}
	mu           sync.RWMutex
	lastActivity atomic.Int64 // Unix nanoseconds; written/read atomically so gcRooms and Broadcast don't race
}

func NewRoom(id string) *Room {
	r := &Room{
		id:      id,
		clients: make(map[*Client]struct{}),
	}
	r.lastActivity.Store(time.Now().UnixNano())
	return r
}

func (r *Room) touch() {
	r.lastActivity.Store(time.Now().UnixNano())
}

// LastActivity returns the time of the most recent client activity in the room.
func (r *Room) LastActivity() time.Time {
	return time.Unix(0, r.lastActivity.Load())
}

// ClientCount returns the current number of clients safely.
func (r *Room) ClientCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.clients)
}

// CloseAll closes every client in the room and empties the client set.
func (r *Room) CloseAll() {
	r.mu.Lock()
	defer r.mu.Unlock()
	for c := range r.clients {
		close(c.send)
		_ = c.conn.Close()
	}
	r.clients = make(map[*Client]struct{})
}

func (r *Room) AddClient(c *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.clients[c] = struct{}{}
	r.touch()
}

func (r *Room) RemoveClient(c *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.clients, c)
	r.touch()
}

func (r *Room) Broadcast(sender *Client, msg []byte) {
	// Take a full lock while walking and potentially pruning the client set.
	r.mu.Lock()
	defer r.mu.Unlock()

	r.touch()
	for c := range r.clients {
		if c == sender {
			continue
		}
		select {
		case c.send <- msg:
		default:
			// slow consumer – drop connection
			close(c.send)
			_ = c.conn.Close()
			delete(r.clients, c)
		}
	}
}
