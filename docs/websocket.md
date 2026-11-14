# WebSocket (WS) --- Architecture, Protocol, and Production Concepts

A practical reference covering the WebSocket protocol, connection
lifecycle, message design, routing, scaling, reliability, security, and
related real-time technologies.

------------------------------------------------------------------------

## 1. What Is WebSocket?

WebSocket is a protocol that provides a **persistent, full-duplex
communication channel** between a client and a server over a single TCP
connection.

After the connection is established, both sides can send messages
independently. The client does not need to issue a new HTTP request for
every update.

### WebSocket vs. Polling vs. Webhooks

  -----------------------------------------------------------------------
  Technology              Communication model     Typical use cases
  ----------------------- ----------------------- -----------------------
  Polling                 Client repeatedly sends Simple status checks
                          HTTP requests at
                          intervals

  WebSocket               Persistent,             Chat, collaboration,
                          bidirectional           live dashboards
                          connection

  Webhook                 A server sends an HTTP  Payment notifications,
                          request to another      integrations
                          system when an event
                          occurs
  -----------------------------------------------------------------------

**Polling** repeatedly asks the server whether new data is available.\
**Background polling** performs those requests in the background, often
at a fixed interval.\
**WebSocket** keeps a connection open so either side can send data at
any time.\
**Webhook** is an event-driven HTTP request sent by one server to
another endpoint.

### When to Use WebSocket

-   Chat and messaging applications
-   Collaborative editing and presence
-   Real-time dashboards
-   Live notifications
-   Multiplayer game events
-   Signaling for WebRTC sessions

WebSocket is not automatically the best choice for every real-time
feature. For one-way server-to-client updates, Server-Sent Events (SSE)
may be simpler.

------------------------------------------------------------------------

## 2. The WebSocket Connection Lifecycle

A WebSocket connection has four states:

  ------------------------------------------------------------------------
                 Numeric value State                 Meaning
  ---------------------------- --------------------- ---------------------
                           0 `CONNECTING`            The connection
                                                     handshake is in
                                                     progress

                           1 `OPEN`                  The WebSocket
                                                     connection is
                                                     established

                           2 `CLOSING`               The connection is
                                                     shutting down

                           3 `CLOSED`                The connection is
                                                     closed or could not
                                                     be established
  ------------------------------------------------------------------------

In browser JavaScript, these values are available through
`WebSocket.CONNECTING`, `WebSocket.OPEN`, `WebSocket.CLOSING`, and
`WebSocket.CLOSED`.

``` js
const socket = new WebSocket("ws://localhost:8080");

console.log(socket.readyState);

if (socket.readyState === WebSocket.OPEN) {
  socket.send("Hello server");
}
```

**Important:** Sending application data is valid only when the
connection is `OPEN`. Calling `send()` while the socket is still
connecting can throw an error. Data sent while closing or closed cannot
be relied upon.

### State transitions

``` text
CONNECTING  ── successful handshake ──> OPEN
     │                                  │
     │ handshake failure                │ close initiated
     ▼                                  ▼
   CLOSED                            CLOSING
                                        │
                                        ▼
                                      CLOSED
```

A connection may also move from `CONNECTING` directly to `CLOSED` if the
handshake fails.

------------------------------------------------------------------------

## 3. The HTTP Upgrade Handshake

WebSocket commonly begins as an HTTP request. The client asks the server
to upgrade the connection from HTTP to WebSocket.

### Client request

``` http
GET /chat HTTP/1.1
Host: example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Version: 13
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
```

The `Sec-WebSocket-Key` is a Base64-encoded random nonce. It is not an
authentication token or secret credential.

### Server response

``` http
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: <computed-value>
```

A successful response uses HTTP status `101 Switching Protocols`. After
the handshake, communication follows the WebSocket protocol rather than
ordinary HTTP request/response messaging.

### Secure WebSocket

-   `ws://` --- WebSocket over an unencrypted connection
-   `wss://` --- WebSocket over TLS

In production, use `wss://` for connections that carry authentication
credentials or private data.

------------------------------------------------------------------------

## 4. TCP Transport and Head-of-Line Blocking

WebSocket typically runs over TCP. TCP provides a reliable, ordered byte
stream.

Imagine the sender transmits three segments:

``` text
Client  ── P1 ── P2 ── P3 ──> Server
                  X
             packet lost
```

If a TCP segment is lost, later bytes may have arrived at the receiving
network stack, but the application cannot consume the complete ordered
stream beyond the missing bytes until TCP recovers the loss.

This is **TCP head-of-line (HOL) blocking**.

Key points:

-   TCP preserves byte order.
-   Lost data is retransmitted.
-   A missing segment can delay delivery of later data on the same TCP
    connection.
-   WebSocket does not remove TCP's ordering or retransmission behavior.

WebTransport over HTTP/3 uses QUIC, which supports independent streams.
This can reduce cross-stream head-of-line blocking, although it does not
eliminate every source of latency or congestion.

------------------------------------------------------------------------

## 5. Ping, Pong, and Connection Health

WebSocket defines control frames for connection management:

-   **Ping (`0x9`)**: asks the peer to respond.
-   **Pong (`0xA`)**: response to a Ping.
-   **Close (`0x8`)**: participates in the closing handshake.

A server can periodically send Ping frames and expect Pong responses.
This helps detect broken or unreachable connections.

``` text
Server  ───── Ping ─────> Client
Server  <──── Pong ────── Client
```

Ping/Pong can help detect:

-   Dead network paths
-   Disconnected clients
-   Stale connections
-   Some cases of idle connection termination

A Pong response is not proof that the user's application is healthy or
that a particular message was processed. For application-level delivery
guarantees, define acknowledgements separately.

### Ghost connections

A **ghost connection** is a connection that still appears open in
application state even though the remote client is no longer reachable.

TCP keepalive, WebSocket Ping/Pong, proxy timeouts, and application
heartbeats can help detect stale connections. Detection is not
instantaneous, so systems should define heartbeat intervals and timeout
thresholds.

------------------------------------------------------------------------

## 6. WebSocket Frames

WebSocket data is carried in frames. A frame includes fields such as:

-   `FIN`: indicates whether this is the final fragment of a message.
-   `RSV1`, `RSV2`, `RSV3`: reserved bits, normally zero unless an
    extension defines their use.
-   `Opcode`: identifies the frame type.
-   `Payload length`: describes the payload size.
-   `Masking key`: used for client-to-server frames.
-   `Payload data`: the frame content.

### Common opcodes

    Opcode Frame type     Purpose
  -------- -------------- ----------------------------------------------
     `0x0` Continuation   Continues a fragmented message
     `0x1` Text           Carries UTF-8 text
     `0x2` Binary         Carries binary data
     `0x8` Close          Starts or participates in connection closure
     `0x9` Ping           Requests a Pong response
     `0xA` Pong           Responds to Ping

A WebSocket message may consist of one frame or multiple fragmented
frames. Control frames such as Ping, Pong, and Close are not fragmented.

------------------------------------------------------------------------

## 7. Text and Binary Data

WebSocket supports text and binary messages.

### Text messages

Text messages are UTF-8. JSON is a common application-level format
because it is readable, flexible, and easy to debug.

``` js
socket.send(
  JSON.stringify({
    userId: 42,
    status: "typing",
  })
);
```

Typical uses:

-   Authentication commands
-   Joining or leaving rooms
-   Chat messages
-   Application events
-   Configuration and status updates

### Binary messages

Binary messages carry raw bytes and can be more efficient for certain
workloads.

Typical uses:

-   Audio chunks
-   Image or file data
-   Sensor readings
-   High-frequency movement updates
-   Compact game-state data

Binary is not inherently faster in every application. The actual benefit
depends on encoding, payload size, serialization cost, network
conditions, and implementation.

In browsers, binary messages can be received as `Blob` or `ArrayBuffer`.
The `binaryType` property controls the preferred representation:

``` js
socket.binaryType = "arraybuffer";

socket.addEventListener("message", (event) => {
  if (event.data instanceof ArrayBuffer) {
    // Process binary data.
  }
});
```

------------------------------------------------------------------------

## 8. Application Message Design: Envelopes

The WebSocket protocol defines how frames are transported. It does not
define your application's message structure. Your application should
define a consistent message envelope.

### Type-based envelope

Useful for chat apps, dashboards, and collaborative tools:

``` json
{
  "type": "CHAT_MESSAGE",
  "id": "uuid-123",
  "payload": {
    "text": "Hey everyone",
    "roomId": "general"
  },
  "metadata": {
    "sentAt": 1705622400
  }
}
```

Recommended fields:

  -----------------------------------------------------------------------
  Field                               Responsibility
  ----------------------------------- -----------------------------------
  `type`                              Identifies which application logic
                                      should run

  `id`                                Unique message identifier for
                                      tracking and deduplication

  `payload`                           Contains the actual application
                                      data

  `metadata`                          Optional context such as timestamps
                                      or trace information
  -----------------------------------------------------------------------

Treat incoming messages as untrusted input. Validate the envelope and
its payload before executing application logic.

### Topic-based messages

Useful for sensors, market tickers, telemetry, and event streams:

``` json
{
  "topic": "stock:AAPL",
  "data": {
    "price": 150.23
  }
}
```

``` json
{
  "topic": "game:lakers-warriors",
  "data": {
    "score": "45-42"
  }
}
```

A topic identifies the stream or subject to which an event belongs.
Clients should only receive topics they are authorized to subscribe to.

------------------------------------------------------------------------

## 9. Connection Registry and Message Routing

A server needs to track active connections and associate them with
users, sessions, rooms, or subscriptions.

A **connection registry** commonly maintains mappings such as:

``` text
userId  -> active WebSocket connections
roomId  -> subscribed connections
topic   -> subscribed connections
socket  -> authenticated session / user context
```

A user may have multiple active connections, for example from a laptop
and a mobile device. Do not assume one user always maps to exactly one
socket.

### Delivery patterns

  -----------------------------------------------------------------------
  Pattern                 Meaning                 Example
  ----------------------- ----------------------- -----------------------
  Unicast                 One sender to one       Direct message
                          recipient

  Multicast               One sender to a         Room or subscription
                          selected group          update

  Broadcast               One sender to all       Global announcement
                          relevant recipients
  -----------------------------------------------------------------------

### Routing models

-   **User routing:** deliver a message to a specific user, often across
    all their active sessions.
-   **Room routing:** deliver a message to members of a room.
-   **Topic routing:** deliver an event to clients subscribed to a
    topic.
-   **Broadcast routing:** deliver to every eligible connection.

### Selective subscription

Broadcasting every event to every client is usually wasteful. Prefer
selective subscriptions so clients receive only the data they need.

Occasional broadcast can be acceptable. High-frequency global
broadcast---for example, sending every movement update to every
connected client every 100 ms---can create unnecessary bandwidth, CPU,
and serialization costs.

------------------------------------------------------------------------

## 10. Multi-Server Architecture and Redis Pub/Sub

A single server can keep its active sockets in local memory. This
becomes a problem when an application runs multiple server instances.

``` text
              Load Balancer
               /         \
          Server 1     Server 2
             |             |
        Local sockets  Local sockets
```

Server 1 does not automatically know which sockets are connected to
Server 2. Their in-memory connection registries are separate.

A shared message broker can distribute events between instances:

``` text
Server 1  ─────┐
              │
              ▼
          Redis Pub/Sub
              ▲
              │
Server 2  ─────┘
```

Redis can act as a message broker:

1.  A client sends a message to Server 1.
2.  Server 1 validates and authorizes the message.
3.  Server 1 publishes an event to Redis.
4.  Other interested server instances receive the event.
5.  Each instance delivers it to its locally connected, eligible
    clients.

Redis becomes a shared communication layer, not a literal shared brain.
Each server still owns and manages its local socket connections.

### Important distinction

Redis Pub/Sub is transient: a subscriber that is disconnected while a
message is published does not receive that message later. If durable
delivery, replay, or consumer acknowledgements are required, consider
Redis Streams or another durable messaging system.

------------------------------------------------------------------------

## 11. Backpressure and Outgoing Buffers

A WebSocket sender may produce messages faster than the receiver or
network can process them. This creates a growing outgoing buffer.

**Backpressure** is the process of preventing a producer from
overwhelming a slower consumer.

Potential consequences of unbounded buffering:

-   Increased memory usage
-   Higher message latency
-   Stale updates being delivered too late
-   Process instability or out-of-memory crashes

Useful strategies:

-   Set maximum message and buffer sizes.
-   Limit per-connection queued data.
-   Drop obsolete updates when newer state supersedes them.
-   Coalesce frequent updates.
-   Apply rate limits.
-   Disconnect clients that remain too slow.
-   Use bounded queues and explicit overload policies.

For example, a live cursor position often does not need every
intermediate update. Keeping the latest position may be more useful than
queueing hundreds of stale positions.

In the browser, `socket.bufferedAmount` reports the number of bytes
queued by `send()` but not yet transmitted to the network.

``` js
if (
  socket.readyState === WebSocket.OPEN &&
  socket.bufferedAmount < 64 * 1024
) {
  socket.send(JSON.stringify({ type: "TYPING" }));
}
```

This is a simple threshold check, not a complete backpressure strategy.

------------------------------------------------------------------------

## 12. Reliability: Fire-and-Forget, ACKs, and Pub/Sub

A successful call to `socket.send()` does not mean the server received,
processed, or persisted the message.

### Fire-and-forget

The sender transmits a message without waiting for an application-level
acknowledgement.

Use only when occasional loss is acceptable or the data is naturally
replaceable.

### Application acknowledgements (ACKs)

For important operations, define an application-level acknowledgement:

``` json
{
  "type": "CHAT_MESSAGE",
  "id": "msg-123",
  "payload": {
    "roomId": "general",
    "text": "Hello"
  }
}
```

Possible server response:

``` json
{
  "type": "ACK",
  "id": "msg-123",
  "payload": {
    "status": "accepted"
  }
}
```

Define what an ACK means. It might mean received, validated, accepted
for processing, or durably stored. Those are different guarantees.

### Deduplication and retries

When clients retry after a timeout, the server may receive the same
logical operation more than once. Use stable message IDs or idempotency
keys and define deduplication behavior.

A robust message flow may look like:

``` text
Client -> Request -> Server
Client <- ACK     <- Server
Client <- Event   <- Server
```

### Pub/Sub

Publish/subscribe separates event producers from consumers. Producers
publish to a channel or topic; interested subscribers receive the event.

This pattern is useful for distributing events between application
services and WebSocket server instances.

------------------------------------------------------------------------

## 13. Reconnection and Fallback Strategies

Connections can fail because of network changes, server restarts, proxy
timeouts, or device sleep.

A production client should define:

-   Reconnection behavior
-   Exponential backoff
-   Random jitter to avoid synchronized reconnect storms
-   Maximum retry limits or a retry policy
-   Authentication refresh behavior
-   Resubscription after reconnect
-   Message retry and deduplication rules
-   User-visible connection status

Example exponential backoff with jitter:

``` js
function getReconnectDelay(attempt) {
  const base = 500;
  const max = 30_000;
  const exponential = Math.min(max, base * 2 ** attempt);
  const jitter = Math.random() * 500;

  return exponential + jitter;
}
```

A reconnect creates a new connection. The client must restore required
subscriptions and application state; it should not assume the previous
server-side session still exists.

### Fallbacks

Depending on product requirements and infrastructure, fallback options
may include:

-   SSE for one-way server updates
-   Long polling when persistent connections are unavailable
-   Ordinary HTTP APIs for non-real-time operations

A fallback is an application and infrastructure design choice, not a
guarantee built into the WebSocket protocol.

------------------------------------------------------------------------

## 14. Server-Side WebSocket Example (`ws` for Node.js)

The `ws` package is a commonly used WebSocket implementation for
Node.js.

``` js
import { WebSocketServer, WebSocket } from "ws";

const wss = new WebSocketServer({ port: 8080 });

wss.on("connection", (ws, request) => {
  console.log("Client joined:", request.socket.remoteAddress);

  ws.on("message", (raw, isBinary) => {
    if (isBinary) {
      console.log("Received binary message:", raw.length);
      return;
    }

    const text = raw.toString();
    console.log("Incoming:", text);
  });

  ws.on("error", (err) => {
    console.error("Socket error:", err.message);
  });

  ws.on("close", (code, reason) => {
    console.log("Socket closed:", code, reason.toString());
  });
});
```

### Server-side connection events

-   `connection`: a client completed the WebSocket handshake.
-   `message`: a message was received.
-   `error`: a socket error occurred.
-   `close`: the connection closed.

Validate incoming data, enforce message-size limits, authenticate
clients, and handle errors explicitly in production.

------------------------------------------------------------------------

## 15. Browser WebSocket Client Example

``` js
const socket = new WebSocket("ws://localhost:8080");

socket.addEventListener("open", () => {
  console.log("Connected");

  socket.send(
    JSON.stringify({
      type: "CHAT_MESSAGE",
      id: crypto.randomUUID(),
      payload: {
        text: "Hello server"
      }
    })
  );
});

socket.addEventListener("message", (event) => {
  try {
    const data = JSON.parse(event.data);
    console.log("New data:", data);
  } catch {
    console.error("Received invalid JSON");
  }
});

socket.addEventListener("error", (event) => {
  console.error("WebSocket error:", event);
});

socket.addEventListener("close", (event) => {
  console.log("Disconnected:", event.code, event.reason);
});
```

Use `wss://` in production when the application is served over HTTPS.
Browsers generally block insecure mixed-content WebSocket connections
from secure pages.

------------------------------------------------------------------------

## 16. Protocol Rules and Application Protocol Design

A protocol is a set of rules that defines how two systems communicate.

The WebSocket protocol defines transport-level behavior, including
framing, control frames, and the closing handshake. Your application
still needs its own rules.

Define:

1.  **Message format:** envelope fields, schemas, and versioning.
2.  **Message types:** allowed commands and events.
3.  **Ordering:** whether order matters and within which scope.
4.  **Timing:** heartbeat intervals, timeouts, and expiration.
5.  **Acknowledgements:** what counts as accepted or completed.
6.  **Errors:** error codes and retryable vs. non-retryable failures.
7.  **Authorization:** who can send, receive, join, or subscribe.
8.  **Limits:** payload size, message rate, and connection limits.

Example application flow:

``` text
Actions:
  join -> sendMessage -> leave

Responses:
  message <- stateUpdate <- ack

Connection signals:
  ping -> pong
  error
  close
```

------------------------------------------------------------------------

## 17. Security, Abuse Prevention, and Traffic Protection

A public WebSocket endpoint can be targeted by malicious or abusive
traffic. Security should be enforced at the handshake and
message-processing layers.

### Authentication and authorization

-   Authenticate the connection during the handshake or through a
    carefully designed post-connect flow.
-   Validate session or token expiration.
-   Authorize every sensitive action, not just the initial connection.
-   Check room membership and topic permissions on the server.
-   Do not trust user IDs, room IDs, or roles supplied by the client
    without verification.

### Input validation

-   Validate message types and payload schemas.
-   Reject malformed or unexpected messages.
-   Limit message sizes and nesting depth.
-   Avoid unsafe deserialization and dynamic command execution.

### Rate and resource controls

-   Rate-limit connection attempts and messages.
-   Limit concurrent connections per user, IP, or account where
    appropriate.
-   Set idle and heartbeat timeouts.
-   Bound outgoing queues and payload sizes.
-   Apply per-room or per-topic publishing limits.

### Threat protection

A layered protection system may include:

1.  **Traffic sources:** bots, suspicious clients, abusive users, and
    DDoS traffic.
2.  **Detection:** identify unusual connection rates, message rates, and
    behavior.
3.  **Filtering and policy enforcement:** block, throttle, challenge, or
    restrict traffic.
4.  **Protected application:** allow validated traffic to reach
    application services.

A WebSocket server should be deployed behind appropriately configured
infrastructure. A conventional HTTP rate limiter may not automatically
limit messages sent after the WebSocket upgrade; message-level limits
are also required.

------------------------------------------------------------------------

## 18. WebSocket, WebRTC, SSE, and WebTransport

  -----------------------------------------------------------------------
  Technology              Communication model     Best suited for
  ----------------------- ----------------------- -----------------------
  WebSocket               Persistent,             Chat, events,
                          bidirectional           collaboration

  WebRTC                  Peer-to-peer            Voice, video, real-time
                          media/data, with        peer data
                          signaling

  SSE                     One-way                 Feeds, notifications,
                          server-to-client event  tickers
                          stream over HTTP

  WebTransport            HTTP/3-based            Low-latency, advanced
                          bidirectional transport real-time applications
                          with streams and
                          datagrams
  -----------------------------------------------------------------------

### WebSocket and WebRTC together

WebSocket is often used for **signaling**, not for carrying the actual
audio or video media.

A typical flow:

1.  Clients connect to a signaling server using WebSocket.
2.  They exchange session setup messages.
3.  They exchange SDP offers/answers and ICE candidates.
4.  WebRTC establishes a peer-to-peer path when possible.
5.  Audio, video, or data travels over the WebRTC connection.

``` text
Client A  <──── WebSocket signaling ────>  Signaling Server
Client B  <──── WebSocket signaling ────>  Signaling Server

Client A  <──────── WebRTC media/data ────────>  Client B
```

ICE helps peers discover a viable network path. STUN and TURN servers
may be needed depending on network conditions.

### WebTransport and QUIC

WebTransport runs over HTTP/3 and QUIC. It supports streams and
datagrams and can be useful when an application needs transport features
beyond a single ordered WebSocket byte stream.

QUIC's independent streams can avoid TCP's cross-stream head-of-line
blocking. WebTransport is not a drop-in replacement for every WebSocket
application; browser support, server support, and deployment
requirements must be evaluated.

------------------------------------------------------------------------

## 19. Deployment Considerations: Persistent Connections

WebSocket connections are long-lived. This changes how infrastructure
must be configured.

Potential problems include:

-   Idle connection timeouts
-   Proxy or load-balancer connection limits
-   Server restarts and deployment interruptions
-   Instance sleep or scale-to-zero behavior
-   Cold starts
-   Connection resets
-   Maximum concurrent connection limits
-   Memory consumed by each active connection

### Production checklist

-   Use a hosting environment that supports long-lived WebSocket
    connections.
-   Configure reverse proxies and load balancers for WebSocket upgrades
    and suitable timeouts.
-   Plan graceful shutdown and client reconnection.
-   Track active connections and per-connection memory.
-   Use shared pub/sub or another inter-instance messaging layer when
    scaling horizontally.
-   Monitor connection counts, message throughput, latency, errors, and
    reconnect rates.
-   Define overload behavior and queue limits.
-   Test deployments while clients are connected.

Serverless or short-lived execution environments can be a poor fit when
they impose strict execution durations, sleep instances, or limit
persistent connections. Evaluate the platform's actual WebSocket and
connection-lifetime guarantees rather than assuming support.

------------------------------------------------------------------------

## 20. Monitoring and Operational Metrics

Useful production metrics include:

-   Active and rejected connections
-   Connection duration
-   Connection and disconnection rates
-   Reconnect attempts
-   Ping/Pong round-trip time and heartbeat timeouts
-   Messages received and sent per second
-   Message processing latency
-   Payload-size distribution
-   Outgoing buffer size
-   Dropped or rejected messages
-   Authentication and authorization failures
-   Per-user and per-room traffic
-   Broker publish/subscribe errors

Logs should include useful correlation identifiers, but avoid logging
authentication tokens, private message contents, or other sensitive
data.

------------------------------------------------------------------------

## 21. Quick Reference

### WebSocket states

``` text
0 = CONNECTING
1 = OPEN
2 = CLOSING
3 = CLOSED
```

### Common frame opcodes

``` text
0x0 = Continuation
0x1 = Text
0x2 = Binary
0x8 = Close
0x9 = Ping
0xA = Pong
```

### Core concepts

  -----------------------------------------------------------------------
  Concept                             Meaning
  ----------------------------------- -----------------------------------
  Handshake                           HTTP request that negotiates a
                                      protocol upgrade

  Full-duplex                         Both peers can send data
                                      independently

  Ping/Pong                           Protocol-level heartbeat control
                                      frames

  Ghost connection                    Stale connection state after a peer
                                      becomes unreachable

  Envelope                            Application-defined message
                                      structure

  Connection registry                 Mapping of sockets to users, rooms,
                                      or subscriptions

  Unicast                             One recipient

  Multicast                           Selected recipients

  Broadcast                           All eligible recipients

  Pub/Sub                             Publishers emit events to
                                      subscribed consumers

  Backpressure                        Preventing a producer from
                                      overwhelming a consumer

  ACK                                 Application-level acknowledgement

  Reconnection                        Establishing a new socket after
                                      disconnection
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 22. Final Architecture Summary

A scalable real-time application commonly combines these pieces:

``` text
Browser / Mobile Client
        |
        | WebSocket (WSS)
        v
Load Balancer / Reverse Proxy
        |
        v
WebSocket Server Instances
        |
        +---- Authentication / Authorization
        |
        +---- Connection Registry
        |
        +---- Message Validation / Rate Limits
        |
        +---- Room and Topic Routing
        |
        v
Message Broker (e.g. Redis Pub/Sub)
        |
        v
Other WebSocket Server Instances
        |
        v
Connected Clients
```

The WebSocket protocol provides the persistent communication channel.
The application is responsible for message semantics, authorization,
routing, reliability, scaling, overload control, observability, and
deployment behavior.
