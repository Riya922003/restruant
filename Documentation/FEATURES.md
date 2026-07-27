# Normal Features

This file explains the non-AI parts of RestaurantOS in plain language. The API route list is in `Documentation/API.md`.

## Roles

RestaurantOS uses server-side role checks. The frontend hides actions a role should not use, but the backend is the real permission boundary.

| Role | Main purpose |
|---|---|
| Owner | Full access across the system |
| Manager | Day-to-day administration and most operational work |
| Chef | Kitchen, recipes, menu availability, ingredient usage, order preparation |
| Waiter | Tables and order taking |
| Cashier | Payments, orders, expenses that involve billing |
| Store Manager | Inventory, suppliers, purchases, stock, and expenses |

The owner role bypasses normal role restrictions. Other roles only get the routes needed for their work.

## Authentication and RBAC

Users log in with email and password. Passwords are hashed before storage. After login, the backend returns a JWT. The frontend sends that token with API requests.

RBAC is enforced in the Express backend middleware. This matters because hiding a button in the UI is not security. If a waiter tries to call a manager-only endpoint directly, the backend returns `403`.

## Dashboard

The dashboard gives each role a useful view instead of showing every metric to every user.

It includes:

- sales overview
- active orders
- kitchen queue
- table occupancy
- low stock items
- monthly expenses
- purchase summary
- profit overview
- supplier summary

Some dashboard sections are role-scoped. For example, financial summaries are for owner/manager-style roles, while kitchen and order data are visible to the roles that need operational visibility.

## Tables

The table module tracks restaurant tables, capacity, and status. Waiters and managers can use it to see which tables are available, occupied, reserved, or unavailable.

Tables connect naturally with orders. Creating or updating orders can change what the dashboard and floor view need to show.

## Orders

The order module supports the restaurant floor workflow:

- waiter or manager creates an order
- items are added from the menu
- order moves through statuses such as preparing, ready, served, paid, or cancelled
- chef can update kitchen status
- cashier or manager can record payment

Orders also support CSV export, filtering, and live updates through WebSockets.

## Menu

The menu module manages categories and menu items. Managers can create and update menu items. Chefs can help control item availability when something cannot be prepared.

Waiters, chefs, cashiers, and managers can read menu data because it is needed across the floor, kitchen, and billing flow.

## Recipes

Recipes connect menu items to ingredients. This lets the system understand what stock is used when food is sold or prepared.

Managers and chefs can manage recipes. Waiters can read recipe-related data where needed, but they do not own recipe setup.

## Inventory

Inventory is split into products, product categories, warehouses, ingredients, and stock movements.

The system tracks stock in and stock out through movement records instead of silently changing numbers without history. This is important because stock changes need to be traceable.

Store managers and managers own most inventory work. Chefs can adjust ingredient stock where kitchen usage requires it.

## Suppliers and Purchases

Suppliers store vendor details used by inventory, purchases, invoices, and expenses.

Purchase orders track planned buying and receiving stock. When a purchase order is received, stock is updated through the backend so the database stays consistent.

Supplier and purchase data is mainly for managers and store managers.

## Expenses

The expense module tracks categories, expense records, and monthly summaries. It supports normal expense entry and CSV export.

Managers, store managers, and cashiers can work with expense records because these roles touch spending, supplier bills, or payment operations.

## Supplier Invoices

Supplier invoices can be created and managed manually. They can also receive uploaded files. Invoice status can move through states such as pending, verified, paid, or disputed.

Invoices can be linked to expense records so supplier bills are reflected in expense reporting.

## Audit Log and Activity Page

The backend writes audit log rows for important mutations such as creating, updating, deleting, exporting, approving, and status changes.

The Activity page reads these logs and shows a timeline. Managers and owners can inspect what happened, who did it, and which entity was affected.

The audit log is not used as the source of truth for business data. It is a trace of actions that already happened.

## Notifications

Notifications are built from the audit/event stream. The notification bell shows recent role-relevant events and an unread count.

Users do not receive their own actions as notifications. For example, if a waiter creates an order, that waiter does not need a notification telling them they created it.

Opening the notification bell marks the feed as seen.

## WebSockets and Polling

RestaurantOS uses WebSockets only where instant updates matter: the order and kitchen loop.

Order events are sent through the Express backend `/ws` endpoint. The browser connects with the same JWT used for REST APIs. The backend only sends order events to roles that need them: owner, manager, chef, waiter, and cashier.

The frontend treats a WebSocket event as a signal to refetch from the API. It does not trust the socket payload as the final data. PostgreSQL remains the source of truth.

Other areas use polling or normal refetching because they do not need instant updates. Invoice AI status uses polling because it waits on background processing. Notification bell data also uses polling, with order WebSocket events helping the order pages stay fresh.

If the WebSocket connection fails, order screens fall back to silent polling.

## Search, Filtering, and Pagination

Most list endpoints support pagination and common query options such as `page`, `limit`, `sort`, `search`, and resource-specific filters.

Sort fields are whitelisted on the backend. Unknown or unsafe sort keys are ignored instead of being placed directly into SQL.

The frontend has search and filter controls on operational pages such as orders, inventory, suppliers, purchases, expenses, invoices, staff, tables, recipes, and menu.

## CSV Import and Export

The system supports CSV exports for several operational lists, including orders, products, suppliers, purchase orders, expenses, and supplier invoices.

Product import supports preview and commit. Preview validates the file and reports row errors without writing data. Commit uses the same validation and follows an all-or-nothing rule.

Exports write audit rows so downloaded operational data is traceable.

## File Uploads

The app supports supplier invoice file uploads and AI invoice uploads. Files are handled by the backend or AI service depending on the workflow.

For normal supplier invoices, the Express backend owns the product rules and database write. For AI invoice processing, the AI service extracts data first, then the user reviews and approves it before it becomes a real supplier invoice.

## Tests and CI

The repository includes tests for the backend and AI service, plus a frontend build check.

Current CI workflows:

- backend tests with a temporary PostgreSQL service
- frontend build
- AI service pytest suite

The same commands can be run locally. Backend tests require a disposable PostgreSQL database.

## Not Delivered Yet

Dark/light mode is not delivered yet. The app has some system-level dark CSS from the base styling, but there is no complete theme toggle with persistence.
