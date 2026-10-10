# AdriPOS

Front end for the restaurant POS, built with Vue 3, TypeScript and Vite.

## Source architecture

- `domain/`: front-end domain models and service-mode rules.
- `application/`: business calculations and the `PosGateway` port.
- `infrastructure/`: HTTP and Socket.IO adapters, including wire contracts.
- `presentation/`: Vue views and focused UI components.
- `app/`: application shell and composition root, which connects the port to its adapters.

Presentation views receive the POS gateway as a dependency; they don't issue HTTP
requests or access Socket.IO directly. Product selection is split into category
navigation and the products inside the selected category.

## Modules

- **Login:** authenticates through the back-end Socket.IO event.
- **Management:** groups salon tables and `LLEVAR` pickup places together, with a separate delivery tab that lists only places whose name contains `Domicilio`.
- **Orders:** selecting a product opens a confirmation dialog for quantity and an optional kitchen note. Every product offers a per-line takeaway option; the marker is retained in UniCenta's open-ticket line properties and displayed to kitchen.
- **Kitchen printing:** saved orders can be manually sent from the web to the Windows printer queue (default or `ADRIPOS_PRINTER_NAME`) through Node on the printer-connected server. Node sends ESC/POS RAW bytes for 80 mm thermal paper; install a compatible printer/driver and configure it for an 80 mm roll.
- **Catalog:** the `Estándar`/`Standard` category is hidden from the POS catalog.
- Identical products with different notes or takeaway options remain separate order lines; identical configurations consolidate quantities.
- **Takeaway:** uses a configured `LLEVAR` place and stores customer name and phone.
- **Delivery:** uses a configured delivery place and stores customer name, phone, address and delivery charge.
- **Kitchen:** each station tab selects tickets with at least one active item for that station, while every matching ticket displays the complete order, the place name, elapsed kitchen time and item-level readiness.
- **Order changes:** kitchen and table lists refresh over Socket.IO after sends, edits, removals and cancellations. Saved notes can be edited for ten minutes after their kitchen item is created.
- **Cancellation:** cancelling an active order removes the unpaid UniCenta shared ticket and the related AdriPOS kitchen ticket, then clears the place's occupied metadata; this is not a way to void a completed sale.

The post-login menu is intentionally a small POS shell. Replace or extend it as the restaurant's workflows become clear.

## Tests

Frontend tests live in `src/tests`; keep new Vitest files there and import the
feature under test from its source layer. Backend Node tests live in
`node_nuevo/src/tests`.

## Local setup

1. Configure and start the Node service in `node_nuevo`. Copy its `.env.example` to `.env`, then set the MySQL connection, `JWT_SECRET`, and kitchen attribute-set IDs.
2. Apply the SQL in `node_nuevo/readme.md` to the UniCenta database if the `KITCHEN_*` or `delivery_orders` tables do not already exist.
3. Start the Java bridge used by the Node ticket serializer. From PowerShell:

   ```powershell
   Set-Location .\java_bridge
   javac -encoding UTF-8 -cp "lib/*;." src\SerialiceService.java src\JsonModels.java src\TicketUtils.java
   java -cp "lib/*;." src.SerialiceService
   ```
4. In this folder, copy `.env.example` to `.env.local`. The current back-end port is `3001`; keep both front-end URLs aligned with `node_nuevo/.env`.
5. For thermal printing, run Node on the Windows computer connected to the printer, install its driver, and configure the paper size as 80 mm. Leave `ADRIPOS_PRINTER_NAME` empty to use the Windows default printer, or set its exact queue name in `node_nuevo/.env`.
6. Run:

   ```powershell
   npm install
   npm run dev
   ```

The front end uses these environment variables:

- `VITE_API_URL`: Node HTTP API base URL.
- `VITE_SOCKET_URL`: Node Socket.IO URL.
- `VITE_ACCOUNTING_ADMIN_ROLE_IDS`: comma-separated UniCenta role IDs shown the accounting module; this must match `ACCOUNTING_ADMIN_ROLE_IDS` in `node_nuevo`.

## Accounting module and production transport

The accounting dashboard is shown only to configured administrator roles. Its
API is separately restricted by Node to the same role IDs; hiding a route or
menu item is not the security boundary. The dashboard reads monthly/yearly
totals, lists cash-account expenses, and imports UniCenta sales. Delivery
counts are kept off the normal accounting dashboard in the private route
`/#/accounting/delivery-sales`. They use `receipts.TABLENAME` values containing "domicilio" when available,
or the AdriPOS delivery marker in `receipts.ATTRIBUTES` when table names are
not stored. Only receipts with positive payment totals count. Newly paid
AdriPOS receipts store the service mode in attributes; older receipts without
a table name or this marker cannot be reliably classified. Imported
receipts are idempotent and require an unambiguous
payment-method-to-cash-account mapping in the accounting database.

For manual income/expense entry on a chosen date, use the unlinked
administrator-only route `/#/accounting/movements/new` after signing in. Both
routes are intentionally not shown in the main menu; Node still verifies the
administrator role for every accounting API request.

The dashboard breaks income and expense totals down by payment account (for
example, Efectivo and Nequi), and lists expenses individually with a search
field. Editing any listed movement requires an authorization password checked
only by the Node backend. Set `ACCOUNTING_EDIT_PASSWORD` in the private
`node_nuevo/.env` to the chosen password (for the requested initial value, set
it to `wonderpizza2017`); do not put it in AdriPOS environment variables,
frontend code, or a committed file. Restart Node after configuring it. The
password is sent only when an edit is submitted and should only be used over
HTTPS outside local development.

For internet-facing production, expose AdriPOS through a reverse proxy with a
valid TLS certificate and HTTPS on the public endpoint. Run Node with
`NODE_ENV=production`, `HOST=127.0.0.1`, `TRUST_PROXY=loopback`, and HTTPS-only
`FRONTEND_ORIGINS`; set both `VITE_API_URL` and `VITE_SOCKET_URL` to the public
HTTPS URL before building the frontend. The proxy must forward HTTP requests and
Socket.IO/WebSocket upgrades to `127.0.0.1:3001` and set
`X-Forwarded-Proto: https`. Do not expose port `3001` directly to the internet.
The production server fails closed if these settings are missing or insecure;
TLS certificates and the proxy itself must still be provisioned and verified on
the deployment host.

### Access from a phone on the same Wi-Fi

Node listens on `0.0.0.0` by default (`HOST` in `node_nuevo/.env`), and Vite
already binds to the network interfaces. Find the computer's current LAN IPv4
address, then set both front-end URLs to `http://<computer-ip>:3001` and include
`http://<computer-ip>:5173` in `FRONTEND_ORIGINS` in the back-end `.env`.
Open `http://<computer-ip>:5173` on the phone. The IP used in `.env.local` is a
local machine setting; update it if the router changes the computer's address.

If the phone still cannot connect, allow inbound TCP ports `3001` and `5173`
through Windows Defender Firewall for the private network, and make sure the
phone and computer are on the same Wi-Fi (not a guest network with client
isolation). Restart Node and Vite after changing environment variables.

The phone does not connect directly to the Java bridge. The Node back end
calls it on the same computer through `http://127.0.0.1:2000`; the bridge is
intentionally bound to loopback and does not need a LAN IP or firewall rule.
Keep the Java bridge running alongside Node when sending or changing tickets.

The login token is stored in browser local storage until its signed 24-hour
expiry, so a page reload does not require signing in again. Signing out removes
the stored token.

## Checks

```powershell
npm test
npm run build
```

The component and unit tests use sample data; they do not require a running MySQL database or Java bridge.

## Delivery-charge accounting

The order's products, quantities, prices and taxes are serialized into UniCenta's ticket. Customer name, phone, address and delivery fee are saved separately in `delivery_orders`, keyed by the selected UniCenta `LLEVAR` place. The customer-facing total is products plus delivery fee; the UniCenta ticket total contains products only.

This separation is covered by back-end regression tests. Keep the fee out of the Java ticket payload if the order serialization changes.
