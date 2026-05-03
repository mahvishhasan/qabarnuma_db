const express = require('express');
const { getPool, sql } = require('../db');
const { validate, parseId } = require('../utils');
const router = express.Router();

// GET /api/cemeteries
router.get('/', async (_req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT c.cemetery_id, c.name, c.location, c.type, c.status,
             COUNT(DISTINCT s.section_id)                              AS sections,
             COUNT(g.grave_id)                                         AS total_graves,
             SUM(CASE WHEN g.status='Occupied'    THEN 1 ELSE 0 END)  AS occupied,
             SUM(CASE WHEN g.status='Available'   THEN 1 ELSE 0 END)  AS available,
             SUM(CASE WHEN g.status='Reserved'    THEN 1 ELSE 0 END)  AS reserved,
             SUM(CASE WHEN g.status='Maintenance' THEN 1 ELSE 0 END)  AS maintenance
      FROM Cemetery c
      LEFT JOIN Section s ON s.cemetery_id = c.cemetery_id
      LEFT JOIN Grave   g ON g.section_id  = s.section_id
      GROUP BY c.cemetery_id, c.name, c.location, c.type, c.status
      ORDER BY c.name`);
    res.json(r.recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/cemeteries/:id
router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM Cemetery WHERE cemetery_id = @id');
    if (!r.recordset.length) return res.status(404).json({ error: 'Cemetery not found' });
    res.json(r.recordset[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/cemeteries
router.post('/', async (req, res) => {
  const { name, location, type, status } = req.body;
  try { validate(['name', 'location', 'type'], req.body); }
  catch (e) { return res.status(400).json({ error: e.message }); }
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('name',     sql.VarChar, name.trim())
      .input('location', sql.VarChar, location.trim())
      .input('type',     sql.VarChar, type)
      .input('status',   sql.VarChar, status || 'Active')
      .query(`INSERT INTO Cemetery (name, location, type, status)
              OUTPUT INSERTED.*
              VALUES (@name, @location, @type, @status)`);
    res.status(201).json(r.recordset[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/cemeteries/:id
router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });
  const { name, location, type, status } = req.body;
  try { validate(['name', 'location', 'type', 'status'], req.body); }
  catch (e) { return res.status(400).json({ error: e.message }); }
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id',       sql.Int,     id)
      .input('name',     sql.VarChar, name.trim())
      .input('location', sql.VarChar, location.trim())
      .input('type',     sql.VarChar, type)
      .input('status',   sql.VarChar, status)
      .query(`UPDATE Cemetery
              SET name=@name, location=@location, type=@type, status=@status
              WHERE cemetery_id=@id`);
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Cemetery not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/cemeteries/:id/sections
router.get('/:id/sections', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT s.*,
               COUNT(g.grave_id)                                          AS graves_count,
               SUM(CASE WHEN g.status='Available'   THEN 1 ELSE 0 END)   AS available_graves,
               SUM(CASE WHEN g.status='Occupied'    THEN 1 ELSE 0 END)   AS occupied_graves,
               SUM(CASE WHEN g.status='Reserved'    THEN 1 ELSE 0 END)   AS reserved_graves,
               SUM(CASE WHEN g.status='Maintenance' THEN 1 ELSE 0 END)   AS maintenance_graves
        FROM Section s
        LEFT JOIN Grave g ON g.section_id = s.section_id
        WHERE s.cemetery_id = @id
        GROUP BY s.section_id, s.cemetery_id, s.name, s.zone_type, s.capacity
        ORDER BY s.name`);
    res.json(r.recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/cemeteries/:id  (soft delete — sets status=Inactive)
router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });
  try {
    const pool = await getPool();
    // Block deletion if cemetery has occupied graves
    const check = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT COUNT(*) AS n FROM Grave g
              JOIN Section s ON g.section_id = s.section_id
              WHERE s.cemetery_id = @id AND g.status = 'Occupied'`);
    if (check.recordset[0].n > 0) {
      return res.status(409).json({ error: 'Cannot deactivate a cemetery with occupied graves' });
    }
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query("UPDATE Cemetery SET status = 'Inactive' WHERE cemetery_id = @id");
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Cemetery not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
