const express = require('express');
const { getPool, sql } = require('../db');
const { validate, parseId } = require('../utils');
const router = express.Router();

// GET /api/sections?cemetery_id=
router.get('/', async (req, res) => {
  const { cemetery_id } = req.query;
  try {
    const pool = await getPool();
    const r2 = pool.request();
    const where = ['1=1'];
    if (cemetery_id) { r2.input('cid', sql.Int, cemetery_id); where.push('s.cemetery_id = @cid'); }
    const r = await r2.query(`
      SELECT
        s.section_id,
        s.cemetery_id,
        s.name,
        s.zone_type,
        s.capacity,
        c.name                                                              AS cemetery_name,
        COUNT(g.grave_id)                                                   AS total_graves,
        SUM(CASE WHEN g.status = 'Available'    THEN 1 ELSE 0 END)         AS available,
        SUM(CASE WHEN g.status = 'Occupied'     THEN 1 ELSE 0 END)         AS occupied,
        SUM(CASE WHEN g.status = 'Reserved'     THEN 1 ELSE 0 END)         AS reserved,
        SUM(CASE WHEN g.status = 'Maintenance'  THEN 1 ELSE 0 END)         AS maintenance
      FROM Section s
      JOIN Cemetery c ON s.cemetery_id = c.cemetery_id
      LEFT JOIN Grave g ON g.section_id = s.section_id
      WHERE ${where.join(' AND ')}
      GROUP BY s.section_id, s.cemetery_id, s.name, s.zone_type, s.capacity, c.name
      ORDER BY c.name, s.name`);
    res.json(r.recordset);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/sections/:id
router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT s.*, c.name AS cemetery_name
        FROM Section s JOIN Cemetery c ON s.cemetery_id = c.cemetery_id
        WHERE s.section_id = @id`);
    if (!r.recordset.length) return res.status(404).json({ error: 'Section not found' });
    res.json(r.recordset[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/sections
router.post('/', async (req, res) => {
  const { cemetery_id, name, zone_type, capacity } = req.body;
  try {
    validate(['cemetery_id', 'name', 'zone_type', 'capacity'], req.body);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('cid', sql.Int,     cemetery_id)
      .input('nm',  sql.VarChar, name.trim())
      .input('zt',  sql.VarChar, zone_type)
      .input('cap', sql.Int,     capacity)
      .query(`INSERT INTO Section (cemetery_id, name, zone_type, capacity)
              OUTPUT INSERTED.*
              VALUES (@cid, @nm, @zt, @cap)`);
    res.status(201).json(r.recordset[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/sections/:id
router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  const { name, zone_type, capacity } = req.body;
  try {
    validate(['name', 'zone_type', 'capacity'], req.body);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id',  sql.Int,     id)
      .input('nm',  sql.VarChar, name)
      .input('zt',  sql.VarChar, zone_type)
      .input('cap', sql.Int,     capacity)
      .query('UPDATE Section SET name=@nm, zone_type=@zt, capacity=@cap WHERE section_id=@id');
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Section not found' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
