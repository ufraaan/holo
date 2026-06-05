# holo load test results

![](https://i.imgur.com/AyZXyZj.gif)

load tests run against the go relay server on localhost (gorilla/websocket, default configuration).

---

## summary

- **~900 connections per room** is the ceiling before cascading disconnections
- **10,000+ concurrent connections** across multiple rooms - server handles it without issues
- **relay latency ~0.1ms** at low room sizes
- **room-state broadcasts are o(n²)** - the primary bottleneck

---

## the room-state problem

every time a client joins or leaves a room, the server broadcasts a `room-state` message to all clients in that room. this creates a cascading problem at scale:

| clients in room | messages broadcasted per join |
|----------------|-------------------------------|
| 10 | 10 |
| 100 | 100 |
| 500 | 500 |
| 900 | 900 |

the send channel per client has 64 slots. when client #900 joins, the server tries to push 900 messages through each client's 64-slot channel in rapid succession. channels overflow, clients get disconnected, and each disconnection triggers another broadcast - making the problem worse.

the cascade starts between 900–1000 clients in a single room. below that threshold, there are no issues.

---

## connection capacity

### single room

| clients | result | notes |
|---------|--------|-------|
| 100 | all connected | |
| 500 | all connected | |
| 900 | all connected | near limit |
| 950 | partial drops | some clients disconnected during join storm |
| 1000 | cascade | mass disconnections from channel overflow |

### multiple rooms

| total clients | rooms | clients/room | result |
|--------------|-------|--------------|--------|
| 1,000 | 50 | 20 | all alive |
| 5,000 | 500 | 10 | all alive |
| 8,000 | 800 | 10 | all alive |
| 10,000 | 1,000 | 10 | all alive |

when clients are spread across rooms, the server handles 10,000+ concurrent connections. the bottleneck is per-room, not global.

---

## throughput & latency

tests measure message delivery between clients in the same room with embedded timestamps.

| setup | msg rate | delivery | latency |
|-------|----------|----------|---------|
| 2 clients/room, 10 rooms | 500/s each | 99.9% | 0.09ms avg, 3.4ms max |
| 100 clients, 1 room | 10/s each | 100% | 0.57ms avg, 3.9ms max |
| 500 clients, 1 room | 1/s each | ~98% | 203ms avg, 3.7s max |
| 2,000 clients, 200 rooms | 10/s each | ~90% | 87ms avg, 1s max |

at low room sizes the relay operates at sub-millisecond latency. at 500 clients per room, room-state broadcasts cause buffering that pushes latency to ~200ms with some message loss.

---

## file transfers

simulated 1mb file transfers (1 file-meta + 16 chunks of 64kb each):

- **2 clients per room:** 100% delivery - files transfer cleanly
- **50+ concurrent transfers:** ~78% delivery - some chunk loss when many clients transmit simultaneously due to channel contention

for the intended use case (one sender, one receiver), file transfers are reliable.

---

## bottlenecks

1. **room-state broadcast o(n²)** - every join/leave triggers a broadcast to all clients in the room. this is the primary limitation. a debounce or batch mechanism would significantly improve single-room capacity.

2. **64-slot send channel** - the per-client buffered channel (`chan []byte`, capacity 64) overflows under burst traffic. increasing buffer size would improve burst tolerance.

3. **single hub goroutine** - all client registration/deregistration is handled by one goroutine sequentially. not a current bottleneck but would show up at significantly higher scale (50k+).

4. **room mutex in broadcast** - `broadcast` holds a write lock while iterating clients. lock contention increases with room size.

---

## what can be done

- **debounce room-state broadcasts** - batch join/leave notifications into a single update sent ~100ms after activity settles. this eliminates the o(n²) storm and would allow rooms to scale well past 900.
- **increase send channel buffer** - 64 → 256. low memory cost, higher burst tolerance.
- **drop instead of disconnect on channel full** - replace the current behavior (close channel + disconnect) with dropping the oldest message. trades reliability for stability under load.

---

test tool at `backend/cmd/loadtest/`

---

> **warning:** these tests were run on a single macbook air (apple m5), localhost only, no real network latency, no docker. server was go 1.22 with gorilla/websocket v1.5.3, default config (64kb read/write buffers, 2mb max frame, 64-slot send channel, 60s pong wait). numbers will vary in production depending on hardware, network conditions, and deployment setup.
