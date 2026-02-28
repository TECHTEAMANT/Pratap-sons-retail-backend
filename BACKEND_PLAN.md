# INVENTO ERP Backend Implementation Plan

## 📋 Project Overview

This backend is a **Node.js + Express + Supabase** API server that replaces the direct Supabase calls made from the React frontend. The frontend currently connects to Supabase directly (using `@supabase/supabase-js`) — we're moving all data access to this backend to add:
- Proper business logic validation
- Server-side authentication & authorization
- Centralized error handling
- API rate limiting & security
- Tally integration endpoints
- Barcode generation services

## 🏗️ Technology Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: Supabase (PostgreSQL) — using `@supabase/supabase-js` (service role key)
- **Authentication**: JWT tokens (from Supabase Auth) + custom middleware
- **Validation**: Joi
- **Security**: Helmet, CORS, express-rate-limit
- **Logging**: Winston
- **Documentation**: Swagger/OpenAPI
- **Testing**: Jest + Supertest

## 📂 Folder Structure

```
backend/
├── src/
│   ├── server.ts                    # Entry point
│   ├── app.ts                       # Express app setup
│   ├── config/
│   │   ├── index.ts                 # Environment config
│   │   ├── supabase.ts              # Supabase client setup
│   │   └── swagger.ts               # Swagger config
│   ├── middleware/
│   │   ├── auth.ts                  # JWT authentication
│   │   ├── permission.ts            # Role-based permission checks
│   │   ├── errorHandler.ts          # Global error handler
│   │   ├── rateLimiter.ts           # Rate limiting
│   │   └── validator.ts             # Request validation wrapper
│   ├── routes/
│   │   ├── index.ts                 # Route aggregator
│   │   ├── auth.routes.ts           # Authentication routes
│   │   ├── dashboard.routes.ts      # Dashboard stats
│   │   ├── inventory.routes.ts      # Inventory & barcode management
│   │   ├── barcode.routes.ts        # Barcode generation & printing
│   │   ├── sales.routes.ts          # Sales invoices & billing
│   │   ├── salesOrder.routes.ts     # Sales orders
│   │   ├── salesReturn.routes.ts    # Sales returns & credit notes
│   │   ├── purchase.routes.ts       # Purchase orders & invoices
│   │   ├── purchaseReturn.routes.ts # Purchase returns
│   │   ├── customer.routes.ts       # Customer management
│   │   ├── booking.routes.ts        # E-Bookings
│   │   ├── payment.routes.ts        # Payment receipts
│   │   ├── master.routes.ts         # Master data CRUD
│   │   ├── user.routes.ts           # User management
│   │   ├── role.routes.ts           # Role management
│   │   ├── report.routes.ts         # Reports
│   │   ├── tally.routes.ts          # Tally sync
│   │   ├── discount.routes.ts       # Discount management
│   │   ├── commission.routes.ts     # Commission & payout codes
│   │   └── health.routes.ts         # Health check
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── dashboard.controller.ts
│   │   ├── inventory.controller.ts
│   │   ├── barcode.controller.ts
│   │   ├── sales.controller.ts
│   │   ├── salesOrder.controller.ts
│   │   ├── salesReturn.controller.ts
│   │   ├── purchase.controller.ts
│   │   ├── purchaseReturn.controller.ts
│   │   ├── customer.controller.ts
│   │   ├── booking.controller.ts
│   │   ├── payment.controller.ts
│   │   ├── master.controller.ts
│   │   ├── user.controller.ts
│   │   ├── role.controller.ts
│   │   ├── report.controller.ts
│   │   ├── tally.controller.ts
│   │   ├── discount.controller.ts
│   │   └── commission.controller.ts
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── dashboard.service.ts
│   │   ├── inventory.service.ts
│   │   ├── barcode.service.ts
│   │   ├── sales.service.ts
│   │   ├── salesOrder.service.ts
│   │   ├── salesReturn.service.ts
│   │   ├── purchase.service.ts
│   │   ├── purchaseReturn.service.ts
│   │   ├── customer.service.ts
│   │   ├── booking.service.ts
│   │   ├── payment.service.ts
│   │   ├── master.service.ts
│   │   ├── user.service.ts
│   │   ├── role.service.ts
│   │   ├── report.service.ts
│   │   ├── tally.service.ts
│   │   ├── discount.service.ts
│   │   └── commission.service.ts
│   ├── interfaces/
│   │   ├── auth.interface.ts
│   │   ├── user.interface.ts
│   │   ├── inventory.interface.ts
│   │   ├── barcode.interface.ts
│   │   ├── sales.interface.ts
│   │   ├── customer.interface.ts
│   │   ├── purchase.interface.ts
│   │   ├── booking.interface.ts
│   │   ├── payment.interface.ts
│   │   ├── master.interface.ts
│   │   ├── report.interface.ts
│   │   └── common.interface.ts
│   ├── validators/
│   │   ├── auth.validator.ts
│   │   ├── inventory.validator.ts
│   │   ├── sales.validator.ts
│   │   ├── purchase.validator.ts
│   │   ├── customer.validator.ts
│   │   ├── booking.validator.ts
│   │   ├── master.validator.ts
│   │   └── common.validator.ts
│   ├── utils/
│   │   ├── gst.ts                   # GST calculation (ported from frontend)
│   │   ├── barcode.ts               # Barcode generation logic
│   │   ├── costEncoding.ts          # CRAZYWOMEN cost encoding
│   │   ├── loyalty.ts               # Loyalty points calculation
│   │   ├── logger.ts                # Winston logger
│   │   ├── response.ts             # Standard API response helper
│   │   └── helpers.ts              # General helpers
│   └── types/
│       └── express.d.ts             # Express type extensions
├── tests/
│   ├── unit/
│   └── integration/
├── scripts/
│   ├── seed/
│   └── migration/
├── .env.example
├── .gitignore
├── tsconfig.json
├── package.json
└── nodemon.json
```

## 📊 Database Tables (from Supabase Migrations)

### Authentication & Users
| Table | Description |
|-------|-------------|
| `users` | User profiles with role_id, name, mobile, mapped_floor, mapped_salesman, active |
| `roles` | Role definitions with 8 permission flags |
| `auth.users` | Supabase managed auth table |

### Product & Inventory
| Table | Description |
|-------|-------------|
| `product_masters` | Design definitions (design_no, product_group, color, vendor, mrp, gst_logic, photos) |
| `barcode_batches` | Batch inventory with 8-digit barcode alias, structured barcode, quantities |
| `product_groups` | Categories (group_code, name, hsn_code) |
| `sizes` | Size definitions (size_code, name, sort_order) |
| `colors` | Color definitions (color_code, name, hex_value) |
| `vendors` | Suppliers (vendor_code, name, address, gstin, mobile) |
| `floors` | Floor assignments (floor_code, name) |
| `barcode_sequence` | Sequential barcode numbering |
| `barcode_print_logs` | Barcode print audit trail |
| `defective_stock` | Defective stock tracking |

### Sales & Customers
| Table | Description |
|-------|-------------|
| `customers` | Customer DB (mobile as primary ID, credit_balance, loyalty_points, city, pincode) |
| `sales_invoices` | Sales records with GST breakdown, payment tracking |
| `sales_invoice_items` | Invoice line items with barcode, design, salesman tracking |
| `sales_orders` | Order management with advance payments |
| `sales_order_items` | Order line items with delivery tracking |
| `sales_order_advances` | Advance payment records |
| `e_bookings` | Floor-wise customer bookings |
| `payment_receipts` | Payment receipts against invoices |

### Purchase Management
| Table | Description |
|-------|-------------|
| `purchase_orders` | PO with taxable_value, manual GST, vendor invoice attachment |
| `purchase_order_items` | PO line items |
| `purchase_invoices` | Purchase records |
| `purchase_returns` | Return processing |
| `purchase_return_items` | Return line items |

### Financial & Returns
| Table | Description |
|-------|-------------|
| `sales_returns` | Return processing |
| `sales_return_items` | Return line items |
| `credit_notes` | Credit note management |
| `credit_note_applications` | Credit usage tracking |

### Configuration
| Table | Description |
|-------|-------------|
| `discount_masters` | Discount configurations |
| `payout_codes` | Salesman payout codes |
| `commission_slabs` | Commission slab definitions |
| `tally_sync` | Tally integration tracking |
| `cities` | City master |

## 🔑 API Endpoints

### Authentication (`/api/auth`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/login` | Login with mobile + password |
| POST | `/logout` | Logout (invalidate session) |
| GET | `/me` | Get current user profile |
| POST | `/change-password` | Change password |

### Dashboard (`/api/dashboard`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/stats` | Today's sales, invoice count, available items, total customers |

### Inventory (`/api/inventory`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List all barcode batches (with filters) |
| GET | `/:id` | Get single barcode batch |
| POST | `/` | Add new inventory item (barcode batch) |
| PUT | `/:id` | Update barcode batch |
| GET | `/search` | Search by barcode alias or structured barcode |
| PUT | `/:id/floor` | Move inventory to different floor |
| PUT | `/:id/adjust-quantity` | Manual stock adjustment |

### Barcode (`/api/barcode`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/generate` | Generate next 8-digit barcode |
| POST | `/print-log` | Log barcode print event |
| GET | `/print-logs` | Get barcode print history |
| GET | `/sequence` | Get current barcode sequence |

### Sales (`/api/sales`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/invoices` | List sales invoices |
| GET | `/invoices/:id` | Get invoice with items |
| POST | `/invoices` | Create sales invoice (transactional RPC) |
| GET | `/invoices/:id/pdf` | Generate invoice PDF data |

### Sales Orders (`/api/sales-orders`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List sales orders |
| GET | `/:id` | Get order with items & advances |
| POST | `/` | Create sales order |
| PUT | `/:id` | Update sales order |
| DELETE | `/:id` | Cancel/delete order |
| POST | `/:id/advances` | Add advance payment |
| PUT | `/:id/deliver` | Mark items as delivered |

### Sales Returns (`/api/sales-returns`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List sales returns |
| GET | `/:id` | Get return with items |
| POST | `/` | Create sales return (auto creates credit note & restores stock) |
| GET | `/credit-notes` | List credit notes |
| GET | `/credit-notes/:id` | Get credit note details |
| POST | `/credit-notes/:id/apply` | Apply credit note to invoice |

### Purchase (`/api/purchases`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/orders` | List purchase orders |
| GET | `/orders/:id` | Get PO with items |
| POST | `/orders` | Create purchase order |
| PUT | `/orders/:id` | Update PO |
| GET | `/invoices` | List purchase invoices |
| POST | `/invoices` | Create purchase invoice |

### Purchase Returns (`/api/purchase-returns`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List purchase returns |
| POST | `/` | Create purchase return |
| PUT | `/:id` | Update purchase return |

### Customers (`/api/customers`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List customers |
| GET | `/:mobile` | Get customer by mobile |
| POST | `/` | Create customer |
| PUT | `/:id` | Update customer |
| GET | `/:mobile/history` | Purchase history |
| GET | `/:mobile/credit-balance` | Credit balance |

### E-Bookings (`/api/bookings`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List bookings |
| POST | `/` | Create booking |
| PUT | `/:id` | Update booking |
| PUT | `/:id/cancel` | Cancel booking |

### Payment Receipts (`/api/payments`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List receipts |
| POST | `/` | Create receipt |
| DELETE | `/:id` | Delete receipt |

### Master Data (`/api/masters`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/product-groups` | List product groups |
| POST | `/product-groups` | Create product group |
| PUT | `/product-groups/:id` | Update product group |
| GET | `/sizes` | List sizes |
| POST | `/sizes` | Create size |
| PUT | `/sizes/:id` | Update size |
| GET | `/colors` | List colors |
| POST | `/colors` | Create color |
| PUT | `/colors/:id` | Update color |
| GET | `/vendors` | List vendors |
| POST | `/vendors` | Create vendor |
| PUT | `/vendors/:id` | Update vendor |
| GET | `/floors` | List floors |
| POST | `/floors` | Create floor |
| PUT | `/floors/:id` | Update floor |
| GET | `/cities` | List cities |
| POST | `/cities` | Create city |
| PUT | `/cities/:id` | Update city |
| GET | `/product-masters` | List product masters |
| POST | `/product-masters` | Create product master |
| PUT | `/product-masters/:id` | Update product master |

### Users (`/api/users`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List users |
| POST | `/` | Create user |
| PUT | `/:id` | Update user |
| PUT | `/:id/deactivate` | Deactivate user |

### Roles (`/api/roles`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List roles |
| POST | `/` | Create role |
| PUT | `/:id` | Update role permissions |
| DELETE | `/:id` | Delete role |

### Reports (`/api/reports`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/sales` | Sales reports (daily/monthly/yearly) |
| GET | `/inventory` | Inventory reports |
| GET | `/purchases` | Purchase reports |
| GET | `/customers` | Customer reports |
| GET | `/gst` | GST reports |
| GET | `/salesman` | Salesman performance reports |
| GET | `/salesman/commission` | Commission calculation reports |

### Discounts (`/api/discounts`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List discount masters |
| POST | `/` | Create discount |
| PUT | `/:id` | Update discount |
| DELETE | `/:id` | Delete discount |

### Commission & Payouts (`/api/commission`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/payout-codes` | List payout codes |
| POST | `/payout-codes` | Create payout code |
| PUT | `/payout-codes/:id` | Update payout code |
| DELETE | `/payout-codes/:id` | Delete payout code |
| GET | `/slabs` | List commission slabs |
| POST | `/slabs` | Create commission slab |
| PUT | `/slabs/:id` | Update slab |
| DELETE | `/slabs/:id` | Delete slab |

### Tally Sync (`/api/tally`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/pending` | List pending sync records |
| POST | `/sync` | Create tally sync record |
| PUT | `/:id/status` | Update sync status |
| GET | `/export` | Export data for Tally |

### Defective Stock (`/api/defective-stock`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List defective stock |
| POST | `/` | Mark stock as defective |
| PUT | `/:id` | Update defective status |

### Health (`/api/health`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |

## 🔐 Permission Mapping

| Permission Flag | Protected Routes |
|-----------------|-----------------|
| `can_manage_sales` | Sales, Sales Orders, Payment Receipts, Sales Returns, E-Bookings, Pending Deliveries |
| `can_manage_inventory` | Inventory, Barcode Management, Barcode Print, Add Item, Defective Stock |
| `can_manage_purchases` | Purchase Orders, Purchase Invoices, Purchase Returns, Tally Sync |
| `can_view_reports` | Reports, Salesman Reports |
| `can_manage_masters` | Master Data, Customer Management, Discounts |
| `can_manage_users` | User Management, Role Management |
| `can_view_cost` | Cost price visibility in responses |
| `can_view_mrp` | MRP visibility in responses |

## 🔧 Business Logic (Ported from Frontend)

### GST Calculation
- `AUTO_5_18`: 5% if taxable < ₹2500, else 18%
- `FLAT_5`: Always 5%
- Reverse GST calculation from MRP inclusive price
- Invoice total with CGST/SGST breakdown (5% and 18%) 

### Barcode System
- 8-digit numeric alias (sequential from `barcode_sequence` table)
- Structured format: `PG-CL-SZ-DESIGN-VENDOR-COST-ORDER-PY`
- CRAZYWOMEN cost encoding (0=C, 1=R, 2=A, 3=Z, 4=Y, 5=W, 6=O, 7=M, 8=E, 9=N)

### Invoice Transaction
- Atomic: lock → generate invoice number → insert invoice → deduct inventory → insert line items → update bookings
- Uses `generate_invoice_transaction()` RPC in Supabase

### Sales Returns
- Auto stock restoration (add back to `barcode_batches.available_quantity`)
- Auto credit note generation (CN + year + 6-digit random)
- Auto customer credit balance update

### Credit Notes
- Application tracking against future invoices
- Auto-update remaining balance and status progression (active → partially_used → fully_used)

### Loyalty Points
- Configurable points per rupee
- Redemption value per point
- Min invoice value for redemption
- Max redemption percentage cap

## 📦 Implementation Order

### Phase 1: Foundation
1. Project setup (tsconfig, .env, package.json)
2. Express app with middleware (helmet, cors, rate-limit)
3. Supabase client configuration (service role)
4. Logger setup (Winston)
5. Error handler middleware
6. Auth middleware (JWT verification via Supabase)
7. Permission middleware
8. Health check endpoint

### Phase 2: Core Features
9. Auth routes (login, me, logout)
10. Master data CRUD (product groups, sizes, colors, vendors, floors, cities)
11. User management
12. Role management
13. Customer management

### Phase 3: Inventory & Barcode
14. Inventory CRUD (barcode batches)
15. Barcode generation service
16. Barcode print logging
17. Product masters
18. Defective stock

### Phase 4: Sales
19. Sales invoice creation (using transactional RPC)
20. Sales invoice listing & detail
21. Sales orders (CRUD + advances + delivery tracking)
22. E-Bookings
23. Payment receipts

### Phase 5: Purchase
24. Purchase orders
25. Purchase invoices
26. Purchase returns

### Phase 6: Returns & Financial
27. Sales returns with auto credit note
28. Credit note management & application
29. Customer credit balance tracking

### Phase 7: Reports & Analytics
30. Dashboard statistics
31. Sales reports
32. Inventory reports
33. Purchase reports
34. Customer reports
35. GST reports
36. Salesman & commission reports

### Phase 8: Integration & Polish
37. Tally sync endpoints
38. Discount management
39. Commission & payout code management
40. Swagger/OpenAPI documentation
41. Comprehensive error handling
42. Request validation (Joi schemas)
43. Logging & audit trail
