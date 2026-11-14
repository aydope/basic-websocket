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
.
├── index.html        # WebSocket test client
├── src/
│   └── index.ts      # WebSocket server
├── docs.md           # Extended documentation
├── package.json
└── tsconfig.json
```

## License

MIT