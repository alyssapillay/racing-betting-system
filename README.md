# 🏇 RaceVault — Horse Racing Betting Management System

A full-stack, production-ready betting management system built with Node.js, Express, SQLite, and a modern dark-themed SPA frontend.

---

## ✨ Features

### Race Management
- Create **race meetings** with course name, date & time
- Add **races** (numbered, named, with distance) under each meeting
- Add **runners (horses)** with barrier numbers and decimal odds
- **Scratch horses** with a configurable deduction percentage
- **Declare winners** and automatically settle all bets

### Betting System
- **Single bets** — one selection, one race
- **Multi / Accumulator bets** — chain multiple selections across different races, combined odds calculated live
- **Live bet slip** with real-time stake/return calculator
- **Automatic wallet deduction** on bet placement
- **Auto-settlement** on race result declaration
- **Refunds** issued when a horse is scratched

### Deduction Module
- Set a % deduction per scratched horse
- Deductions are applied proportionally to winning returns at settlement
- Visible on the horse card and in race results

### User Management (Admin)
- Create users with roles: `admin`, `clerk`, `punter`
- Allocate wallet balances via deposit/withdrawal
- View full transaction history per user
- Activate/deactivate accounts

### Reporting
- House P&L, total turnover, total paid out
- Margin % and win rate
- Per-race bet breakdown with winner/loser summary

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Git

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/racing-betting-system.git
cd racing-betting-system

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your preferred settings

# 4. Initialize the database
npm run init-db

# 5. Start the server
npm run dev       # development (auto-reload)
npm start         # production
```

The app will be running at **http://localhost:3000**

---

## 🔐 Default Admin Login

```
Email:    admin@racingbet.com
Password: Admin@123456
```

> **Change these immediately** in your `.env` file before running `npm run init-db`

---

## 📁 Project Structure

```
racing-betting-system/
├── server.js                  # Express app entry point
├── package.json
├── .env.example               # Environment template
├── .gitignore
│
├── database/
│   ├── db.js                  # SQLite connection + schema init
│   └── init.js                # Standalone DB initializer script
│
├── middleware/
│   └── auth.js                # JWT authentication + role guard
│
├── routes/
│   ├── auth.js                # Login, /me, change password
│   ├── users.js               # User CRUD + wallet management
│   ├── races.js               # Meetings, races, horses, scratching, results
│   └── betslips.js            # Bet submission + settlement
│
└── public/                    # Frontend SPA
    ├── index.html
    ├── css/
    │   └── style.css
    └── js/
        ├── api.js             # API client (fetch wrapper)
        ├── utils.js           # Formatting, toast, modal helpers
        ├── betslip.js         # BetSlip state manager + live calc
        ├── pages.js           # All page renderers
        └── app.js             # Router + auth + init
```

---

## 🗄️ Database Schema

| Table | Description |
|---|---|
| `users` | Accounts with roles and wallet balances |
| `race_meetings` | Course, date, time, status |
| `races` | Numbered races under a meeting |
| `horses` | Runners with odds, barrier, scratch info |
| `betslips` | Single or multi bet containers |
| `betslip_selections` | Individual legs of a betslip |
| `bets` | Individual bet records linked to horse + race |
| `transactions` | Full wallet audit trail |

---

## 🔌 API Reference

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/login` | Login, returns JWT |
| GET | `/api/auth/me` | Current user info |
| POST | `/api/auth/change-password` | Change password |

### Users (Admin)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/users` | List all users |
| POST | `/api/users` | Create user |
| PUT | `/api/users/:id` | Update user |
| DELETE | `/api/users/:id` | Deactivate user |
| POST | `/api/users/:id/deposit` | Add funds |
| POST | `/api/users/:id/withdraw` | Remove funds |
| GET | `/api/users/:id/transactions` | Transaction history |

### Meetings & Races
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/races/meetings` | List meetings |
| POST | `/api/races/meetings` | Create meeting |
| PUT | `/api/races/meetings/:id` | Update meeting |
| DELETE | `/api/races/meetings/:id` | Delete meeting |
| GET | `/api/races` | List races |
| POST | `/api/races` | Create race |
| GET | `/api/races/:id` | Get race + horses |
| POST | `/api/races/:id/result` | Declare winner + settle |
| POST | `/api/races/:id/horses` | Add horse |
| PUT | `/api/races/horse/:id` | Update horse |
| POST | `/api/races/horse/:id/scratch` | Scratch horse |
| DELETE | `/api/races/horse/:id` | Delete horse |

### Betslips
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/betslips` | List betslips |
| POST | `/api/betslips` | Submit bet (single or multi) |
| GET | `/api/betslips/:id` | Get betslip detail |
| GET | `/api/betslips/race/:raceId/results` | Race P&L breakdown |

---

## 🧮 Betting Calculations

### Single Bet
```
Potential Return = Stake × Horse Odds
```

### Multi / Accumulator
```
Combined Odds    = Odds1 × Odds2 × ... × OddsN
Potential Return = Stake × Combined Odds
```

### Deduction (Scratched Horse)
```
Deduction Factor = 1 - (Total Deduction % / 100)
Actual Return    = Stake + (Profit × Deduction Factor)
```

---

## 🔧 Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `JWT_SECRET` | — | **Required**: min 32 char secret |
| `JWT_EXPIRES_IN` | `24h` | Token expiry |
| `ADMIN_EMAIL` | `admin@racingbet.com` | Initial admin email |
| `ADMIN_PASSWORD` | `Admin@123456` | Initial admin password |
| `ADMIN_NAME` | `System Owner` | Admin display name |
| `DB_PATH` | `./database/racing.db` | SQLite file location |

---

## 🛠️ Development

```bash
# Install nodemon for auto-reload
npm run dev

# Re-initialize DB (warning: deletes existing data)
rm database/racing.db && npm run init-db
```

---

## 📤 Pushing to GitHub

```bash
git init
git add .
git commit -m "Initial commit: RaceVault betting system"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/racing-betting-system.git
git push -u origin main
```

---

## 🔒 Security Notes

- All routes are JWT-protected
- Passwords hashed with bcrypt (12 rounds)
- Admin routes double-guarded with role middleware
- Users can only view their own data
- SQLite WAL mode for concurrent read performance
- Foreign keys enforced at DB level

---

## 📝 License

MIT — use freely for personal or commercial projects.
