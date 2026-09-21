# SyncDoc - Frontend

Real-time collaborative document editor (React + Vite).

## Run the project

1. Start the backend first (in a separate terminal):

       cd server
       npm install
       npm run dev

   The server needs a `server/.env` file with `MONGO_URI` and `JWT_SECRET`.

2. Start the frontend (from the project root):

       npm install
       npm run dev

   The app runs on http://localhost:5173. Requests to `/api` are proxied to
   the backend on http://localhost:5000 (see `vite.config.js`).

## Folder structure

    src/
      components/
        Auth/      Login, Signup, Forgot Password, route guards
        Editor/    Editor + Toolbar
        Layout/    Title bar
      pages/       EditorPage
      services/    api.js  (all backend calls)
      utils/       auth.js (JWT session storage)

## How the editor sends data

The editor reports `{ html, text }` on every change. The backend
text-to-tree function converts `html` into the document tree:
Document -> Paragraph -> Text (with bold/italic/underline marks).

## Auth flow

- Login/Signup call `/api/auth/login` and `/api/auth/signup`.
- The JWT is stored in localStorage ("Remember me") or sessionStorage.
- `/editor` is protected; logged-out users are redirected to `/login`.