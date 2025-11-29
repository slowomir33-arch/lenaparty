# Galeria Online

This repo now ships with a PHP backend that mirrors the previous Node endpoints, so the SPA can keep calling `/api/*` without any code changes. The PHP API stores albums under `backend/uploads`, keeps metadata in `backend/data/albums.json`, generates thumbnails, and builds ZIP packages with the correct `Light` / `Max` folder names.

## Local development

1. Install dependencies once with `npm install`.
2. Start the PHP API (requires PHP 8.1+ with `gd`, `zip`, and `fileinfo` extensions):
   ```bash
   npm run api
   ```
   This runs `php -S localhost:3001 -t backend backend/php/router.php`, serving `/api/*` and static `/uploads/*` files on the same port the frontend already expects.
3. In a second terminal run the Vite dev server:
   ```bash
   npm run dev
   ```
4. Open the frontend (default `http://localhost:5173`). It will hit `http://localhost:3001` for API + media. Override `VITE_API_URL` if you host the backend elsewhere.

## Upload flow

- Upload requests may contain nested folders. Files inside any `light` directory are treated as the web-sized previews; matching files inside `max` directories are stored for ZIP downloads only.
- Albums automatically flip into `light/max` mode once they receive both variants. From that moment every additional upload must provide matching folders, which guarantees that only `light` photos appear on the site while `max` files stay private.
- Uploads without the two-folder structure still work in legacy "flat" mode—the files go straight into the album root and are used for both gallery and downloads.

## Downloads

- `GET /api/albums/:id/download` streams a ZIP containing two folders (`Light` / `Max`) when the album uses the structured layout, or a single folder otherwise.
- `POST /api/download-multiple` accepts `{ "albumIds": ["..."] }` and stitches multiple albums into one ZIP. Each folder keeps the same friendly naming convention used for single downloads.

## Data + storage

- Uploaded files live in `backend/uploads/albums/<albumId>/[light|max]`.
- Generated thumbnails are stored under `backend/uploads/thumbnails/<albumId>` (always JPEGs sized to 400×400).
- Album metadata is persisted in `backend/data/albums.json`; it is safe to edit via the API only.

Deploy the `backend` folder (including `php`, `uploads`, and `data`) to any PHP-capable host and point the frontend's `VITE_API_URL` to that domain. No Node runtime is required anymore for uploads, zip creation, or album management.
