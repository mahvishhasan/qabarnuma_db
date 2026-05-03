const express = require('express');
const { getPool } = require('../db');
const router = express.Router();

// Cemetery occupancy
router.get('/cemetery-occupancy', async (_req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT c.cemetery_id, c.name AS cemetery, c.type, c.location,
             COUNT(g.grave_id) AS total_graves,
             SUM(CASE WHEN g.status='Occupied'    THEN 1 ELSE 0 END) AS occupied,
             SUM(CASE WHEN g.status='Available'   THEN 1 ELSE 0 END) AS available,
             SUM(CASE WHEN g.status='Reserved'    THEN 1 ELSE 0 END) AS reserved,
             SUM(CASE WHEN g.status='Maintenance' THEN 1 ELSE 0 END) AS maintenance,
             CAST(100.0 * SUM(CASE WHEN g.status='Occupied' THEN 1 ELSE 0 END)
               / NULLIF(COUNT(g.grave_id),0) AS DECIMAL(5,2)) AS occupancy_pct
      FROM Cemetery c
      JOIN Section s ON s.cemetery_id = c.cemetery_id
      JOIN Grave   g ON g.section_id  = s.section_id
      WHERE c.status = 'Active'
      GROUP BY c.cemetery_id, c.name, c.type, c.location
      ORDER BY occupancy_pct DESC`);
    res.json(r.recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Section occupancy breakdown
router.get('/section-occupancy', async (_req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT c.name AS cemetery_name, s.section_id, s.name AS section_name,
             s.zone_type, s.capacity,
             COUNT(g.grave_id) AS occupied_count,
             CAST(100.0 * COUNT(g.grave_id) / NULLIF(s.capacity,0) AS DECIMAL(5,2)) AS fill_pct
      FROM Section s
      JOIN Cemetery c ON s.cemetery_id = c.cemetery_id
      JOIN Grave    g ON g.section_id  = s.section_id
      WHERE g.status = 'Occupied'
      GROUP BY s.section_id, s.name, s.zone_type, s.capacity, c.name
      HAVING COUNT(g.grave_id) > 0
      ORDER BY fill_pct DESC`);
    res.json(r.recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// UNION: Pending death cases + pending funeral services
router.get('/pending-tasks', async (_req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT 'Death Case' AS item_type,
             CAST(dc.case_id AS VARCHAR)    AS ref_id,
             dc.deceased_name               AS description,
             CAST(dc.date_of_death AS VARCHAR) AS relevant_date,
             dc.status
      FROM DeathCase dc WHERE dc.status = 'Pending'
      UNION
      SELECT 'Funeral Service',
             CAST(fs.service_id AS VARCHAR),
             fs.service_type,
             CAST(fs.scheduled_datetime AS VARCHAR),
             fs.status
      FROM FuneralService fs WHERE fs.status = 'Pending'
      ORDER BY item_type, relevant_date`);
    res.json(r.recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// INTERSECT: Staff who have both performed funeral services AND confirmed burials
// Uses proper INTERSECT on user_id sets
router.get('/dual-role-staff', async (_req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT u.user_id, u.name, u.role
      FROM [User] u
      WHERE u.user_id IN (
        SELECT assigned_staff_id FROM FuneralService
        WHERE assigned_staff_id IS NOT NULL AND status = 'Completed'
        INTERSECT
        SELECT confirmed_by FROM BurialRecord
        WHERE confirmed_by IS NOT NULL
      )`);
    res.json(r.recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// EXCEPT: Death cases with no funeral services assigned at all
router.get('/cases-without-services', async (_req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT case_id, deceased_name, date_of_death, status
      FROM DeathCase
      WHERE status NOT IN ('Cancelled','Completed')
      EXCEPT
      SELECT dc.case_id, dc.deceased_name, dc.date_of_death, dc.status
      FROM DeathCase dc
      JOIN FuneralService fs ON dc.case_id = fs.case_id`);
    res.json(r.recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Dashboard stats
router.get('/dashboard', async (_req, res) => {
  try {
    const pool = await getPool();
    const [cem, graves, cases, pending] = await Promise.all([
      pool.request().query("SELECT COUNT(*) AS n FROM Cemetery WHERE status='Active'"),
      pool.request().query(`SELECT COUNT(*) AS total,
        SUM(CASE WHEN status='Available' THEN 1 ELSE 0 END) AS available,
        SUM(CASE WHEN status='Occupied'  THEN 1 ELSE 0 END) AS occupied
        FROM Grave`),
      pool.request().query('SELECT COUNT(*) AS total FROM DeathCase'),
      pool.request().query("SELECT COUNT(*) AS n FROM DeathCase WHERE status='Pending'"),
    ]);
    res.json({
      activeCemeteries: cem.recordset[0].n,
      totalGraves:      graves.recordset[0].total,
      availableGraves:  graves.recordset[0].available,
      occupiedGraves:   graves.recordset[0].occupied,
      totalCases:       cases.recordset[0].total,
      pendingCases:     pending.recordset[0].n,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
