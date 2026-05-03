# QabarNuma — Cemetery Management System

A full-stack cemetery management system for Islamic burial grounds in Lahore.  
Built with **Node.js · Express · SQL Server · Vanilla HTML/CSS/JS**

---

## Run it (requires only Docker Desktop)

### Prerequisites
Install **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** and make sure it is running.  
That is the only requirement. No Node, no SQL Server, no setup needed.

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/qabarnuma.git
cd qabarnuma

# 2. Start everything
docker compose up --build
```

Wait about **60 seconds** for SQL Server to initialize.  
You will see this line when it is ready:

```
qabarnuma_app | QabarNuma server running on http://localhost:3000
```

Open **http://localhost:3000** in your browser.

---

## Daily commands

| Action | Command |
|--------|---------|
| Start | `docker compose up` |
| Stop | `docker compose down` |
| Rebuild after code changes | `docker compose up --build` |
| Wipe database and start fresh | `docker compose down -v && docker compose up --build` |

---

## Connect via SSMS or Azure Data Studio

| Field | Value |
|-------|-------|
| Server | `localhost,1433` |
| Username | `sa` |
| Password | `QabarNuma_2024!` |
| Database | `QabarNuma` |

---

## Project structure

```
qabarnuma/
├── backend/
│   ├── routes/        One route file per resource (11 files)
│   ├── utils/         Shared validation helpers
│   ├── db.js          SQL Server connection pool
│   └── server.js      Express entry point
├── frontend/
│   ├── css/           styles.css
│   ├── js/            app.js
│   └── pages/         HTML pages (9 pages)
├── schema.sql          BCNF normalized schema + seed data
├── schema_fixes.sql    Integrity constraints
├── Dockerfile          Node app container
└── docker-compose.yml  Orchestrates app + database
```

---

## Features (25 functionalities)

| # | Feature |
|---|---------|
| 1 | View cemeteries with live occupancy stats |
| 2 | Add cemetery |
| 3 | View / add sections per cemetery |
| 4 | Browse graves with filters |
| 5 | Add grave (with zone/plot-type compatibility check) |
| 6 | Update grave status |
| 7 | Register death case |
| 8 | View / filter death cases |
| 9 | View unburied cases |
| 10 | Add burial record (transactional — cascades grave + case status) |
| 11 | View burial records |
| 12 | Create grave reservation (transactional) |
| 13 | Approve / reject / expire reservations |
| 14 | Assign funeral services (Ghusl, Kafan, etc.) |
| 15 | Mark service complete |
| 16 | Staff performance tracker |
| 17 | Add / manage staff and users |
| 18 | Cemetery occupancy report |
| 19 | UNION — pending tasks (death cases + funeral services) |
| 20 | INTERSECT — staff who served services AND confirmed burials |
| 21 | EXCEPT — cases with no services assigned |
| 22 | Section breakdown report |
| 23 | Graveyard visual block map |
| 24 | Family group management |
| 25 | Gender statistics summary |
