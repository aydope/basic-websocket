# ws-basic

A basic WebSocket server built with Node.js and `ws`.

## Requirements

- Node.js 20+
- npm

## Install

```bash
npm install
```

## Development

Start the WebSocket server (port 3000):

```bash
npm run dev
```

Serve `index.html` (port 3001) in a separate terminal:

```bash
npm run client
```

Run both at the same time:

```bash
npm run all
```

## Build

```bash
npm run build
```

## Production

```bash
npm start
```

## Type check

```bash
npm run typecheck
```

## Project structure

```bash
basic-websocket/
├── public/
│   └── index.html        # WebSocket test client
│   └── styles.css
├── src/
│   └── index.ts          # Standalone WebSocket server (no Express/HTTP)
│   └── attach.ts         # Attach WebSocket to an existing Express/HTTP server
├── docs/
│   └── websocket.md      # Extended documentation
├── .gitignore
├── README.md
├── package.json
├── package-lock.json
└── tsconfig.json
```

## License

MIT