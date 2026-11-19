# Architecture

## Layout

- `webapp/src/app` — React UI. `storage.ts` is the only data client; it calls the same-origin API.
- `webapp/src/website` — the public website, rendered to static HTML at build time.
- `server/src/http` — Express routes (`api.ts`) and request field limits.
- `server/src/domain` — business rules shared by every route: authentication (`auth.ts`),
  permissions and role views, business actions (`actions.ts`), ticket workflow, conversations,
  public QR intake.
- `server/src/storage` — MongoDB persistence (`database.ts`) and private attachment files.
- `server/src/shared` — types and browser-safe helpers (dates, store/QR validation, dashboard
  counts, attachment checks). The webapp imports these as `@shared/…`.

Types for every record (`Ticket`, `Store`, `Client`, `User`, …) and for the result of every
`/api/action` type live in `server/src/shared/types.ts`, so the UI and the server cannot drift.

## Code flow

React starts with `GET /api/auth/session`. After sign-in, `useWorkspace` (`webapp/src/app/hooks/useWorkspace.ts`) loads the role-filtered snapshot and polls for changes; it coalesces overlapping reads and refreshes after a mutation. `webapp/src/app/storage.ts` is the only runtime data client. Browser state is limited to UI state such as filters, forms and dialogs.

Express validates JSON and the request origin, resolves the hashed session from the HttpOnly cookie, then runs authorization and the shared domain rules. Rules cover master records, accounts, assignment/reviewer ownership, ticket history, invoices, notifications, soft deletion and QR verification. The table below maps screens to API routes.

`server/src/storage/database.ts` maps each record type to a Mongoose collection. A workspace revision detects conflicting saves and a MongoDB transaction commits related writes together. The API still loads a workspace snapshot to run the existing domain rules and serve the current dashboards. Ticket attachments stay in private disk storage; MongoDB contains their metadata, and the API checks ticket access before download. Failed writes clean up files created by that request.

Public QR intake uses a rate-limited Store Code check. The server issues a short-lived, single-use grant bound to the verified store. The submission derives the client/store from the grant and creates a pending Low-priority ticket plus team notifications.

The legacy browser storage fixture is used only by regression tests. The separate export/import scripts migrate old browser records and attachments explicitly; the live frontend never reads legacy storage or falls back to it.

## Integration map

The workspace uses in-app navigation; `/portal/?store=…` opens the standalone QR intake. Forms, search, filters, pagination, dialogs, QR rendering/share/download and password visibility are client-side UI state. Data reads and writes use the same-origin Express API.

| Screen / action                                                | API                                                                                                                             | Data and authorization                                                                                                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Login, session restore, logout (no self sign-up)               | `/api/auth/login`, `/session`, `/logout`                                                                                        | Users and hashed expiring sessions; only accounts created by Admin can sign in                                                                                           |
| Dashboard, Masters, lists, counts, search, filters             | `GET /api/state`                                                                                                                | Role-filtered clients, stores, services, users, tickets, notifications, invoices; Customer sees linked clients, Worker sees assigned jobs                                |
| Client create/edit/status/delete/restore, linked store count   | `/api/action`: `client`, `clientStatus`, `archive`, `restore`                                                                   | Clients; Admin writes, scoped readers; soft deletion preserves history                                                                                                   |
| Store create/edit/address/location/code/delete/restore         | `/api/action`: `store`, `storeCode`, `archive`, `restore`                                                                       | Stores and client references; Admin writes, scoped readers; code visible only to Admin                                                                                   |
| Service catalogue                                              | `/api/action`: `service`                                                                                                        | Active services for intake; Admin/Supervisor maintain catalogue                                                                                                          |
| Users & logins, field workers                                  | `/api/action`: `user` (`approve` for legacy pending accounts)                                                                   | Admin creates staff and Customer logins (linked to a client, optionally one store); Supervisor manages field workers                                                     |
| Ticket creation, assignment, close                             | `/api/action`: `ticket`, `assign`, `close`                                                                                      | Ticket, store/service/reviewer references, notifications and invoice drafts; Customer can create for own stores, Admin/Supervisor manage jobs, assigned Worker may close |
| Ticket history, comments, follow-ups, reviewer, resolve/reopen | `/api/tickets/:ticketId/conversation`; `/api/action`: `comment`, `editComment`, `followupDone`, `reviewer`, `resolve`, `reopen` | Ticket history with author/contact snapshots; ownership, reviewer and assignment checks enforced server-side                                                             |
| Images on creation and history attachments                     | `/api/action`: `ticket`; `/api/tickets/:ticketId/attachments` and `/:attachmentId`                                              | Private file bytes and persisted references; write and download require ticket access                                                                                    |
| Bell and read status                                           | `GET /api/state`; `/api/action`: `read`                                                                                         | Recipient-scoped notifications                                                                                                                                           |
| Invoice drafts and edits                                       | `GET /api/state`; `/api/action`: `invoice`                                                                                      | One draft per closed ticket; Admin/Accounts edit, linked Customer reads                                                                                                  |
| Public Store QR intake                                         | `/api/public/verify`, `/api/public/tickets`                                                                                     | Rate-limited Store Code; short-lived single-use grant tied to the verified store, server sets client/status/priority                                                     |
| Browser migration                                              | Offline export + `npm run import:browser`                                                                                       | Explicit operator migration; never a public upload endpoint                                                                                                              |

## Importing legacy browser records

1. On the browser profile and origin that holds the old data, run the reviewed contents of
   `server/scripts/export-browser.js` in DevTools. It downloads an offline JSON export including
   ticket files. It does not export password hashes or sessions.
2. Start the server once so it creates the Admin, then stop it. Import only into an empty
   workspace: `npm run import:browser -w server -- "C:/path/a2z-browser-export.json"` validates and
   prints counts; add `--apply` to import. Keep the export private.
3. For each imported account that needs a login, set `ACCOUNT_EMAIL` and `ACCOUNT_PASSWORD`
   temporarily in `server/.env`, run `npm run account:password -w server`, then remove them.

Existing server data in the old single `workspaces` document is read automatically and moved into
record collections on the first successful write; the original document is kept as a backup.
