package server

import (
	"encoding/json"
	"sync"
	"testing"
	"time"
)

func makeTestClient(roomID, id string) *Client {
	return &Client{
		roomID: roomID,
		id:     id,
		send:   make(chan []byte, 8),
	}
}

func drain(ch chan []byte) {
	for {
		select {
		case <-ch:
		default:
			return
		}
	}
}

func readRoomState(t *testing.T, ch chan []byte) int {
	t.Helper()
	select {
	case msg := <-ch:
		var payload struct {
			Type    string `json:"type"`
			Payload struct {
				ClientCount int `json:"clientCount"`
			} `json:"payload"`
		}
		if err := json.Unmarshal(msg, &payload); err != nil {
			t.Fatalf("unmarshal room-state: %v", err)
		}
		if payload.Type != "room-state" {
			t.Fatalf("unexpected message type: %s", payload.Type)
		}
		return payload.Payload.ClientCount
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for room-state message")
		return 0
	}
}

func TestHubAddClientBroadcastsRoomState(t *testing.T) {
	h := NewHub(10 * time.Minute)

	c1 := makeTestClient("room-a", "c1")
	h.addClient(c1)
	if got := readRoomState(t, c1.send); got != 1 {
		t.Fatalf("expected clientCount 1, got %d", got)
	}

	c2 := makeTestClient("room-a", "c2")
	h.addClient(c2)
	if got := readRoomState(t, c2.send); got != 2 {
		t.Fatalf("expected new client to receive clientCount 2, got %d", got)
	}
	if got := readRoomState(t, c1.send); got != 2 {
		t.Fatalf("expected existing client to receive clientCount 2, got %d", got)
	}
}

func TestHubRemoveClientBroadcastsRoomState(t *testing.T) {
	h := NewHub(10 * time.Minute)

	c1 := makeTestClient("room-b", "c1")
	c2 := makeTestClient("room-b", "c2")
	h.addClient(c1)
	h.addClient(c2)

	drain(c1.send)
	drain(c2.send)

	h.removeClient(c2)
	if got := readRoomState(t, c1.send); got != 1 {
		t.Fatalf("expected clientCount 1 after removal, got %d", got)
	}
}

func TestRoomBroadcastSkipsSender(t *testing.T) {
	room := NewRoom("room-c")
	sender := makeTestClient("room-c", "sender")
	receiver := makeTestClient("room-c", "receiver")
	room.AddClient(sender)
	room.AddClient(receiver)

	room.Broadcast(sender, []byte("hello"))

	select {
	case <-sender.send:
		t.Fatal("sender should not receive its own broadcast")
	default:
	}

	select {
	case got := <-receiver.send:
		if string(got) != "hello" {
			t.Fatalf("expected \"hello\", got %q", string(got))
		}
	case <-time.After(time.Second):
		t.Fatal("receiver did not receive broadcast")
	}
}

func TestHubBroadcastForwardsToRoom(t *testing.T) {
	h := NewHub(10 * time.Minute)

	c1 := makeTestClient("room-d", "c1")
	c2 := makeTestClient("room-d", "c2")
	h.addClient(c1)
	h.addClient(c2)

	drain(c1.send)
	drain(c2.send)

	h.Broadcast("room-d", c1, []byte("forwarded"))

	select {
	case msg := <-c2.send:
		if string(msg) != "forwarded" {
			t.Fatalf("expected forwarded message, got %q", string(msg))
		}
	case <-time.After(time.Second):
		t.Fatal("receiver did not get forwarded message")
	}

	select {
	case <-c1.send:
		t.Fatal("sender should not receive its own forwarded message")
	default:
	}
}

func TestHubBroadcastSilentlySkipsUnknownRoom(t *testing.T) {
	h := NewHub(10 * time.Minute)
	c := makeTestClient("room-e", "c1")

	h.Broadcast("nonexistent", c, []byte("gone"))
}

func TestGcRoomsEvictsIdleRoom(t *testing.T) {
	h := NewHub(time.Hour)

	room := NewRoom("room-f")
	h.mu.Lock()
	h.rooms["room-f"] = room
	h.mu.Unlock()

	room.lastActivity.Store(time.Now().Add(-2 * time.Hour).UnixNano())

	h.gcRooms()

	h.mu.RLock()
	_, exists := h.rooms["room-f"]
	h.mu.RUnlock()
	if exists {
		t.Fatal("idle room should have been evicted by gc")
	}
}

func TestGcRoomsEvictsEmptyRoom(t *testing.T) {
	h := NewHub(time.Hour)

	c1 := makeTestClient("room-g", "c1")
	c2 := makeTestClient("room-g", "c2")
	h.addClient(c1)
	h.addClient(c2)
	h.removeClient(c1)
	h.removeClient(c2)

	h.gcRooms()

	h.mu.RLock()
	_, exists := h.rooms["room-g"]
	h.mu.RUnlock()
	if exists {
		t.Fatal("empty room should have been evicted by gc")
	}
}

func TestRoomCloseAllClosesClients(t *testing.T) {
	room := NewRoom("room-h")
	c1 := makeTestClient("room-h", "c1")
	c2 := makeTestClient("room-h", "c2")
	room.AddClient(c1)
	room.AddClient(c2)

	room.CloseAll()

	if room.ClientCount() != 0 {
		t.Fatalf("expected 0 clients after CloseAll, got %d", room.ClientCount())
	}

	_, ok1 := <-c1.send
	if ok1 {
		t.Fatal("expected c1 send channel to be closed")
	}
	_, ok2 := <-c2.send
	if ok2 {
		t.Fatal("expected c2 send channel to be closed")
	}
}

func TestBroadcastAllSendsToAllIncludingSender(t *testing.T) {
	room := NewRoom("room-i")
	c1 := makeTestClient("room-i", "c1")
	c2 := makeTestClient("room-i", "c2")
	room.AddClient(c1)
	room.AddClient(c2)

	drain(c1.send)
	drain(c2.send)

	room.BroadcastAll([]byte("to-everyone"))

	for i, c := range []*Client{c1, c2} {
		select {
		case msg := <-c.send:
			if string(msg) != "to-everyone" {
				t.Fatalf("client %d expected 'to-everyone', got %q", i, string(msg))
			}
		case <-time.After(time.Second):
			t.Fatalf("client %d did not receive BroadcastAll", i)
		}
	}
}

func TestSlowConsumerGetsEvicted(t *testing.T) {
	room := NewRoom("room-j")
	fast := makeTestClient("room-j", "fast")
	slow := makeTestClient("room-j", "slow")

	slow.send = make(chan []byte, 1)
	fast.send = make(chan []byte, 64)

	room.AddClient(fast)
	room.AddClient(slow)

	slow.send <- []byte("stale")

	room.BroadcastAll([]byte("ping"))

	select {
	case <-fast.send:
	case <-time.After(time.Second):
		t.Fatal("fast client should have received the message")
	}

	room.mu.RLock()
	_, slowStillInRoom := room.clients[slow]
	room.mu.RUnlock()
	if slowStillInRoom {
		t.Fatal("slow consumer should have been evicted after broadcast")
	}
}

func TestClientsInDifferentRoomsAreIsolated(t *testing.T) {
	h := NewHub(10 * time.Minute)

	ra := makeTestClient("room-alpha", "a1")
	rb := makeTestClient("room-beta", "b1")
	h.addClient(ra)
	h.addClient(rb)

	drain(ra.send)
	drain(rb.send)

	h.Broadcast("room-alpha", ra, []byte("alpha-only"))

	select {
	case <-rb.send:
		t.Fatal("client in room-beta should not receive room-alpha messages")
	case <-time.After(100 * time.Millisecond):
	}

	select {
	case msg := <-ra.send:
		t.Fatal("sender should not receive own message, got ", string(msg))
	case <-time.After(50 * time.Millisecond):
	}
}

func TestConcurrentAddRemoveBroadcast(t *testing.T) {
	h := NewHub(time.Hour)

	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			c := makeTestClient("room-concurrent", "")
			h.addClient(c)
			h.Broadcast("room-concurrent", c, []byte("data"))
			h.removeClient(c)
		}(i)
	}

	wg.Wait()

	h.mu.RLock()
	room, exists := h.rooms["room-concurrent"]
	var count int
	if exists {
		count = len(room.clients)
	}
	h.mu.RUnlock()
	if exists && count > 0 {
		t.Fatalf("expected 0 clients after all removed, got %d", count)
	}
}

func TestLastActivityUpdatesOnAddAndRemove(t *testing.T) {
	room := NewRoom("room-k")
	before := room.LastActivity()

	time.Sleep(time.Millisecond)

	c := makeTestClient("room-k", "c1")
	room.AddClient(c)

	if !room.LastActivity().After(before) {
		t.Fatal("lastActivity should update after AddClient")
	}

	before = room.LastActivity()
	time.Sleep(time.Millisecond)
	room.RemoveClient(c)

	if !room.LastActivity().After(before) {
		t.Fatal("lastActivity should update after RemoveClient")
	}
}

func TestClientCountAfterOperations(t *testing.T) {
	room := NewRoom("room-l")

	c1 := makeTestClient("room-l", "c1")
	c2 := makeTestClient("room-l", "c2")
	c3 := makeTestClient("room-l", "c3")

	if room.ClientCount() != 0 {
		t.Fatalf("expected 0, got %d", room.ClientCount())
	}

	room.AddClient(c1)
	if room.ClientCount() != 1 {
		t.Fatalf("expected 1, got %d", room.ClientCount())
	}

	room.AddClient(c2)
	room.AddClient(c3)
	if room.ClientCount() != 3 {
		t.Fatalf("expected 3, got %d", room.ClientCount())
	}

	room.RemoveClient(c2)
	if room.ClientCount() != 2 {
		t.Fatalf("expected 2, got %d", room.ClientCount())
	}
}
