const express = require('express');
const { getPool, sql } = require('../db');
const { validate, parseId } = require('../utils');
const router = express.Router();

// GET /api/plottypes
router.get('/', async (_req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT pt.*, COUNT(g.grave_id) AS graves_using
      FROM PlotType pt
      LEFT JOIN Grave g ON g.plot_type_id = pt.plot_type_id
      GROUP BY pt.plot_type_id, pt.name, pt.max_slots, pt.size_description
      ORDER BY pt.name`);
    res.json(r.recordset);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/plottypes/:id
router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM PlotType WHERE plot_type_id = @id');
    if (!r.recordset.length) return res.status(404).json({ error: 'Plot type not found' });
    res.json(r.recordset[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/plottypes
router.post('/', async (req, res) => {
  const { name, max_slots, size_description } = req.body;
  try {
    validate(['name', 'max_slots'], req.body);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('nm',  sql.VarChar, name.trim())
      .input('ms',  sql.Int,     max_slots)
      .input('sd',  sql.VarChar, size_description || null)
      .query(`INSERT INTO PlotType (name, max_slots, size_description)
              OUTPUT INSERTED.*
              VALUES (@nm, @ms, @sd)`);
    res.status(201).json(r.recordset[0]);
  } catch (e) {
    if (e.number === 2627 || e.number === 2601) {
      return res.status(409).json({ error: `Plot type '${name}' already exists` });
    }
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/plottypes/:id
router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  const { name, max_slots, size_description } = req.body;
  try {
    validate(['name', 'max_slots'], req.body);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int,     id)
      .input('nm', sql.VarChar, name)
      .input('ms', sql.Int,     max_slots)
      .input('sd', sql.VarChar, size_description || null)
      .query('UPDATE PlotType SET name=@nm, max_slots=@ms, size_description=@sd WHERE plot_type_id=@id');
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Plot type not found' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
