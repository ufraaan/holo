package server

import (
	"encoding/json"
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
