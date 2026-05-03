const express = require('express');
const { getPool, sql } = require('../db');
const { validate, parseId } = require('../utils');
const router = express.Router();

// GET /api/familygroups?search=
router.get('/', async (req, res) => {
  const { search } = req.query;
  try {
    const pool = await getPool();
    const r2 = pool.request();
    const where = ['1=1'];
    if (search) {
      r2.input('q', sql.VarChar, `%${search}%`);
      where.push('(fg.group_name LIKE @q OR fg.contact_person LIKE @q OR fg.contact_phone LIKE @q)');
    }
    const r = await r2.query(`
      SELECT
        fg.*,
        COUNT(g.grave_id) AS graves_count
      FROM FamilyGroup fg
      LEFT JOIN Grave g ON g.family_group_id = fg.family_group_id
      WHERE ${where.join(' AND ')}
      GROUP BY fg.family_group_id, fg.group_name, fg.contact_person,
               fg.contact_phone, fg.contact_email, fg.notes, fg.created_at
      ORDER BY fg.group_name`);
    res.json(r.recordset);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/familygroups/:id
router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM FamilyGroup WHERE family_group_id = @id');
    if (!r.recordset.length) return res.status(404).json({ error: 'Family group not found' });

    // Also fetch their graves
    const graves = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT g.grave_id, g.grave_code, g.status,
               s.name AS section, c.name AS cemetery
        FROM Grave g
        JOIN Section s ON g.section_id = s.section_id
        JOIN Cemetery c ON s.cemetery_id = c.cemetery_id
        WHERE g.family_group_id = @id`);

    res.json({ ...r.recordset[0], graves: graves.recordset });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/familygroups
router.post('/', async (req, res) => {
  const { group_name, contact_person, contact_phone, contact_email, notes } = req.body;
  try {
    validate(['group_name', 'contact_person', 'contact_phone'], req.body);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('gn',  sql.VarChar, group_name)
      .input('cp',  sql.VarChar, contact_person)
      .input('ph',  sql.VarChar, contact_phone)
      .input('em',  sql.VarChar, contact_email || null)
      .input('nt',  sql.VarChar, notes || null)
      .query(`INSERT INTO FamilyGroup (group_name, contact_person, contact_phone, contact_email, notes)
              OUTPUT INSERTED.*
              VALUES (@gn, @cp, @ph, @em, @nt)`);
    res.status(201).json(r.recordset[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/familygroups/:id
router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  const { group_name, contact_person, contact_phone, contact_email, notes } = req.body;
  try {
    validate(['group_name', 'contact_person', 'contact_phone'], req.body);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int,     id)
      .input('gn', sql.VarChar, group_name)
      .input('cp', sql.VarChar, contact_person)
      .input('ph', sql.VarChar, contact_phone)
      .input('em', sql.VarChar, contact_email || null)
      .input('nt', sql.VarChar, notes || null)
      .query(`UPDATE FamilyGroup
              SET group_name=@gn, contact_person=@cp, contact_phone=@ph,
                  contact_email=@em, notes=@nt
              WHERE family_group_id=@id`);
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Family group not found' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
