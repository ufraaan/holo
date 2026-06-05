package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"net/url"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

type envelope struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
	Text    string          `json:"text,omitempty"`
}

type latencyPayload struct {
	SenderID string `json:"senderId"`
	Seq      int64  `json:"seq"`
	SentAt   int64  `json:"sentAt"`
}

type stats struct {
	dialOK   atomic.Int64
	dialFail atomic.Int64
	sent     atomic.Int64
	recv     atomic.Int64
	latSum   atomic.Int64
	latCount atomic.Int64
	latMin   atomic.Int64
	latMax   atomic.Int64
}

func main() {
	vus := flag.Int("vus", 10, "virtual users")
	rooms := flag.Int("rooms", 1, "rooms")
	duration := flag.Duration("duration", 15*time.Second, "duration")
	rate := flag.Int("rate", 10, "messages per second per client")
	server := flag.String("server", "ws://localhost:8080/ws", "server address")
	scenario := flag.String("scenario", "broadcast", "connect or broadcast")
	flag.Parse()

	total := *vus
	fmt.Printf("═══ Latency Test ═══\n")
	fmt.Printf("  VUs:       %d\n", total)
	fmt.Printf("  Rooms:     %d\n", *rooms)
	fmt.Printf("  Rate:      %d/s\n", *rate)
	fmt.Printf("  Duration:  %s\n", *duration)
	fmt.Printf("  Scenario:  %s\n", *scenario)
	fmt.Println()

	var s stats
	s.latMin.Store(1<<63 - 1)

	var wg sync.WaitGroup
	start := time.Now()

	for i := 0; i < total; i++ {
		wg.Add(1)
		roomID := fmt.Sprintf("lt%d", i%*rooms)
		clientID := fmt.Sprintf("vu%d", i)
		go runClient(*server, roomID, clientID, *scenario, *rate, *duration, &s, &wg)
		time.Sleep(2 * time.Millisecond)
	}

	wg.Wait()
	elapsed := time.Since(start)

	fmt.Println()
	fmt.Printf("═══ Results (%s) ═══\n", elapsed.Round(time.Second))
	fmt.Printf("  Dial OK:        %d\n", s.dialOK.Load())
	fmt.Printf("  Dial FAIL:      %d\n", s.dialFail.Load())
	fmt.Printf("  Still alive:    %d\n", s.dialOK.Load())
	fmt.Printf("  Messages sent:  %d\n", s.sent.Load())
	fmt.Printf("  Messages recv:  %d\n", s.recv.Load())
	if s.sent.Load() > 0 {
		pct := float64(s.recv.Load()) / float64(s.sent.Load()) * 100
		fmt.Printf("  Delivery rate:  %.1f%%\n", pct)
	}
	if s.latCount.Load() > 0 {
		c := s.latCount.Load()
		avg := float64(s.latSum.Load()) / float64(c) / 1e6
		min := float64(s.latMin.Load()) / 1e6
		max := float64(s.latMax.Load()) / 1e6
		fmt.Printf("  Latency (ms):\n")
		fmt.Printf("    min: %.3f\n", min)
		fmt.Printf("    avg: %.3f\n", avg)
		fmt.Printf("    max: %.3f\n", max)
		fmt.Printf("    samples: %d\n", c)
	}
}

func runClient(server, roomID, clientID, scenario string, rate int, duration time.Duration, s *stats, wg *sync.WaitGroup) {
	defer wg.Done()

	u := fmt.Sprintf("%s?roomId=%s&clientId=%s", server, url.QueryEscape(roomID), url.QueryEscape(clientID))
	c, _, err := websocket.DefaultDialer.Dial(u, nil)
	if err != nil {
		s.dialFail.Add(1)
		return
	}
	s.dialOK.Add(1)

	go func() {
		defer c.Close()
		for {
			_, data, err := c.ReadMessage()
			if err != nil {
				return
			}
			s.recv.Add(1)
			var env envelope
			if err := json.Unmarshal(data, &env); err != nil {
				continue
			}
			if env.Payload != nil {
				var lp latencyPayload
				if err := json.Unmarshal(env.Payload, &lp); err == nil && lp.SentAt > 0 {
					now := time.Now().UnixNano()
					lat := now - lp.SentAt
					s.latSum.Add(lat)
					c := s.latCount.Add(1)
					if c == 1 {
						s.latMin.Store(lat)
						s.latMax.Store(lat)
					} else {
						for {
							cur := s.latMin.Load()
							if lat >= cur {
								break
							}
							if s.latMin.CompareAndSwap(cur, lat) {
								break
							}
						}
						for {
							cur := s.latMax.Load()
							if lat <= cur {
								break
							}
							if s.latMax.CompareAndSwap(cur, lat) {
								break
							}
						}
					}
				}
			}
		}
	}()

	if scenario == "file" {
		// Send file-meta + 16 chunks (1 MB)
		meta, _ := json.Marshal(map[string]interface{}{
			"fileId": clientID + "-file",
			"name":   "loadtest.bin",
			"size":   1048576,
			"mime":   "application/octet-stream",
		})
		metaMsg, _ := json.Marshal(envelope{Type: "file-meta", Payload: meta})
		c.WriteMessage(websocket.TextMessage, metaMsg)
		s.sent.Add(1)

		for i := 0; i < 16; i++ {
			chunk := make([]byte, 65536)
			chunkPayload, _ := json.Marshal(map[string]interface{}{
				"fileId": clientID + "-file",
				"chunk":  string(chunk),
				"offset": i * 65536,
				"final":  i == 15,
			})
			chunkMsg, _ := json.Marshal(envelope{Type: "file-chunk", Payload: chunkPayload})
			c.WriteMessage(websocket.TextMessage, chunkMsg)
			s.sent.Add(1)
			time.Sleep(10 * time.Millisecond)
		}
		<-time.After(duration)
	} else if scenario == "connect" {
		<-time.After(duration)
	} else {
		ticker := time.NewTicker(time.Second / time.Duration(rate))
		defer ticker.Stop()
		done := time.After(duration)
		var seq int64
	loop:
		for {
			select {
			case <-ticker.C:
				seq++
				lp, _ := json.Marshal(latencyPayload{
					SenderID: clientID,
					Seq:      seq,
					SentAt:   time.Now().UnixNano(),
				})
				msg, _ := json.Marshal(envelope{
					Type:    "text",
					Text:    "loadtest",
					Payload: lp,
				})
				if err := c.WriteMessage(websocket.TextMessage, msg); err != nil {
					break loop
				}
				s.sent.Add(1)
			case <-done:
				break loop
			}
		}
	}

	c.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
}
