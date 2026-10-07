# SyncDoc

SyncDoc is a browser-based document editor with private documents and real-time collaboration rooms. The frontend is built with React and Vite. An Express API handles accounts and document data, MongoDB stores persistent data, and a Yjs WebSocket server synchronizes approved room members.

## Features

- Sign up and log in with email and password; Google and GitHub sign-in are available when configured.
- Create, rename, search, organize, and save documents and folders.
- Edit rich text with formatting, lists, code blocks, images, tables, and spreadsheet-style sheets with formulas.
- Export documents as PDF.
- Create or join collaboration rooms. Hosts approve or deny join requests; MongoDB room membership is checked by the backend before Yjs access is granted.
- Synchronize document content and title with approved collaborators through the editor's Yjs connection.
- See collaborators and indicators for room documents changed while you were away.
- Use light or dark appearance settings.

Private documents use the REST API for loading and saving. They do not open a Yjs WebSocket connection.

## Requirements

- Node.js and npm
- A MongoDB instance reachable by the backend (local MongoDB or MongoDB Atlas)

## Run locally

Open two terminals from the project directory.

### 1. Configure and start the backend

Create `server/.env`:

```dotenv
MONGO_URI=mongodb://127.0.0.1:27017/syncdoc
JWT_SECRET=replace-with-a-long-random-secret
PORT=5000
CLIENT_URL=http://localhost:5173

# Optional: enable Google and GitHub OAuth sign-in
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

For MongoDB Atlas, use the connection string provided by Atlas as `MONGO_URI` and make sure the machine running the backend is allowed to connect. Keep real secrets in `.env`; do not commit them.

Then run:

```bash
cd server
npm install
npm run dev
```

The REST API listens on port `5000` by default. The Yjs WebSocket server listens on port `1234`.

### 2. Start the frontend

In a second terminal, from the project root:

```bash
npm install
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`). During development, Vite forwards `/api` requests to the Express server on `http://localhost:5000`.

### Optional OAuth setup

Set the Google or GitHub client ID and secret in `server/.env`. Configure each OAuth application’s callback URL as:

```text
<CLIENT_URL>/api/auth/google/callback
<CLIENT_URL>/api/auth/github/callback
```

For local development, `CLIENT_URL` is normally `http://localhost:5173`. In production, set it to the public frontend origin and configure the matching callback URLs with each provider.

## Configuration and deployment

The frontend sends REST calls to the relative `/api` path. In production, configure your web server or hosting platform to forward `/api` requests to the Express backend. The Vite proxy in `vite.config.js` is for local development only.

The frontend’s WebSocket origin defaults to `ws://localhost:1234`. To use a different address, set `VITE_WS_URL` in the frontend environment, for example:

```dotenv
VITE_WS_URL=wss://your-domain.example
```

The deployed proxy must forward WebSocket upgrades to the Yjs server. Use `wss://` when the frontend is served over HTTPS. The Yjs server currently starts on port `1234` from `server/server.js`.

For production OAuth, set `NODE_ENV=production`, use HTTPS, and set `CLIENT_URL` to the public frontend origin. Never put database passwords, JWT secrets, or OAuth client secrets in frontend environment variables.

## How the application fits together

```text
React/Vite frontend
  ├── REST requests: /api/* ──> Express API ──> MongoDB
  └── room collaboration ────> Yjs WebSocket server ──> MongoDB room state
```

- `src/services/api.js` is the shared frontend API client. It uses `/api` and attaches the logged-in user’s JWT.
- `server/src/routes` contains the authentication, document, folder, collaboration, and room APIs.
- `server/src/sockets/yjsServer.js` authenticates WebSocket clients and authorizes them against MongoDB room membership. The client-side Yjs approval map is not the authorization source.
- `src/components/Editor/Editor.jsx` owns the editor’s Yjs document and WebSocket provider. The title hook reuses that connection.
- Private documents load and save through REST without opening a Yjs connection. A collaboration room is used only after the room lookup confirms it exists.

## Main API routes

All routes below are under `/api`.

| Route | Purpose |
| --- | --- |
| `GET /health` | Backend health check |
| `/auth` | Signup, login, current user, and optional OAuth |
| `/documents` | List, create, read, update, delete, sync acknowledgement, and PDF export |
| `/folders` | Create, list, update, and delete folders |
| `/rooms` | Create rooms, request membership, list join requests, and approve or deny members |
| `/collab` | List and update the user’s collaboration document list |

## Useful commands

Run these from the project root unless noted otherwise:

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Create the frontend production build in `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint on the frontend |

From `server/`:

| Command | Description |
| --- | --- |
| `npm run dev` | Start the API and Yjs servers with nodemon |
| `npm start` | Start the API and Yjs servers with Node |

## Project structure

```text
src/
  components/
    Auth/       Login, signup, OAuth callback, and route guards
    Editor/     Rich-text editor and toolbar
    Layout/     Editor title bar
    Sidebar/    Document and folder explorer
  hooks/        Shared document title hook
  pages/        Welcome and editor pages
  services/     Shared REST API client
  utils/        Frontend authentication/session helpers

server/
  src/
    config/     MongoDB connection
    middleware/ JWT authentication
    models/     MongoDB models
    routes/     REST API routes
    sockets/    Authenticated Yjs WebSocket server
    utils/      Document and PDF utilities
```
