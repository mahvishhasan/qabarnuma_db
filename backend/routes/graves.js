const express = require('express');
const { getPool, sql } = require('../db');
const { validate, parseId, paginate } = require('../utils');
const router = express.Router();

// GET /api/graves/available/max-capacity
router.get('/available/max-capacity', async (_req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT g.grave_id, g.grave_code, g.landmark_description, g.row_number,
             pt.name AS plot_type, s.name AS section, s.capacity, c.name AS cemetery
      FROM Grave g
      JOIN Section  s  ON g.section_id   = s.section_id
      JOIN Cemetery c  ON s.cemetery_id  = c.cemetery_id
      JOIN PlotType pt ON g.plot_type_id = pt.plot_type_id
      WHERE g.status = 'Available'
        AND s.capacity = (SELECT MAX(capacity) FROM Section)
      ORDER BY g.grave_code`);
    res.json(r.recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/graves?section=&status=&cemetery=&search=&zone_type=&page=&limit=
router.get('/', async (req, res) => {
  const { section, status, cemetery, search, zone_type } = req.query;
  const { limit, offset, page } = paginate(req.query);
  try {
    const pool = await getPool();
    const req2 = pool.request();
    const where = ['1=1'];
    if (section)   { req2.input('sec', sql.Int,     section);       where.push('g.section_id = @sec'); }
    if (status)    { req2.input('st',  sql.VarChar, status);        where.push('g.status = @st'); }
    if (cemetery)  { req2.input('cem', sql.Int,     cemetery);      where.push('s.cemetery_id = @cem'); }
    if (zone_type) { req2.input('zt',  sql.VarChar, zone_type);     where.push('s.zone_type = @zt'); }
    if (search)    { req2.input('q',   sql.VarChar, `%${search}%`); where.push('(g.grave_code LIKE @q OR g.landmark_description LIKE @q)'); }

    req2.input('limit',  sql.Int, limit);
    req2.input('offset', sql.Int, offset);

    const whereClause = where.join(' AND ');

    const [data, countRes] = await Promise.all([
      req2.query(`
        SELECT g.grave_id, g.grave_code, g.status, g.row_number,
               g.landmark_description, g.family_group_id,
               pt.name AS plot_type, pt.max_slots, pt.size_description,
               s.section_id, s.name AS section_name, s.zone_type,
               c.cemetery_id, c.name AS cemetery_name,
               fg.group_name AS family_group_name
        FROM Grave g
        JOIN Section     s  ON g.section_id   = s.section_id
        JOIN Cemetery    c  ON s.cemetery_id  = c.cemetery_id
        JOIN PlotType    pt ON g.plot_type_id = pt.plot_type_id
        LEFT JOIN FamilyGroup fg ON g.family_group_id = fg.family_group_id
        WHERE ${whereClause}
        ORDER BY c.name, s.name, g.row_number, g.grave_code
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`),
      pool.request().query(`
        SELECT COUNT(*) AS total FROM Grave g
        JOIN Section  s ON g.section_id  = s.section_id
        JOIN Cemetery c ON s.cemetery_id = c.cemetery_id
        WHERE ${whereClause}`),
    ]);

    res.json({
      data:  data.recordset,
      total: countRes.recordset[0].total,
      page,
      limit,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/graves/:id
router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });
  try {
    const pool = await getPool();
    const r = await pool.request().input('id', sql.Int, id).query(`
      SELECT g.*, pt.name AS plot_type, pt.max_slots, pt.size_description,
             s.name AS section_name, s.zone_type, s.capacity,
             c.name AS cemetery_name, c.location,
             fg.group_name AS family_group_name, fg.contact_person, fg.contact_phone
      FROM Grave g
      JOIN Section     s  ON g.section_id   = s.section_id
      JOIN Cemetery    c  ON s.cemetery_id  = c.cemetery_id
      JOIN PlotType    pt ON g.plot_type_id = pt.plot_type_id
      LEFT JOIN FamilyGroup fg ON g.family_group_id = fg.family_group_id
      WHERE g.grave_id = @id`);
    if (!r.recordset.length) return res.status(404).json({ error: 'Grave not found' });
    res.json(r.recordset[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/graves
router.post('/', async (req, res) => {
  const { section_id, plot_type_id, grave_code, status, row_number,
          landmark_description, family_group_id } = req.body;
  try { validate(['section_id', 'plot_type_id', 'grave_code', 'row_number'], req.body); }
  catch (e) { return res.status(400).json({ error: e.message }); }

  if (parseInt(row_number) < 1) return res.status(400).json({ error: 'row_number must be at least 1' });

  try {
    const pool = await getPool();

    // Validate zone/plot-type compatibility
    // Child sections should only get Child plot types and vice-versa
    const sectionRow = await pool.request()
      .input('sid', sql.Int, section_id)
      .query('SELECT zone_type FROM Section WHERE section_id = @sid');
    if (!sectionRow.recordset.length) return res.status(404).json({ error: 'Section not found' });

    const plotRow = await pool.request()
      .input('pid', sql.Int, plot_type_id)
      .query('SELECT name FROM PlotType WHERE plot_type_id = @pid');
    if (!plotRow.recordset.length) return res.status(404).json({ error: 'Plot type not found' });

    const zoneType = sectionRow.recordset[0].zone_type;
    const plotName = plotRow.recordset[0].name.toLowerCase();
    if (zoneType === 'Child' && !plotName.includes('child')) {
      return res.status(409).json({ error: `Child sections can only use Child plot types (attempted: ${plotRow.recordset[0].name})` });
    }
    if (zoneType !== 'Child' && plotName.includes('child')) {
      return res.status(409).json({ error: `Child plot types can only be placed in Child sections (this section is ${zoneType})` });
    }

    const r = await pool.request()
      .input('sec',  sql.Int,     section_id)
      .input('pt',   sql.Int,     plot_type_id)
      .input('code', sql.VarChar, grave_code.trim().toUpperCase())
      .input('st',   sql.VarChar, status || 'Available')
      .input('row',  sql.Int,     row_number)
      .input('lm',   sql.VarChar, landmark_description || null)
      .input('fg',   sql.Int,     family_group_id || null)
      .query(`INSERT INTO Grave (section_id, plot_type_id, grave_code, status,
                row_number, landmark_description, family_group_id)
              OUTPUT INSERTED.*
              VALUES (@sec, @pt, @code, @st, @row, @lm, @fg)`);
    res.status(201).json(r.recordset[0]);
  } catch (e) {
    if (e.number === 2627 || e.number === 2601)
      return res.status(409).json({ error: `Grave code '${grave_code}' already exists` });
    res.status(e.status || 500).json({ error: e.message });
  }
});

// PATCH /api/graves/:id/status  — must come before /:id
router.patch('/:id/status', async (req, res) => {
  const id = parseId(req.params.id);
  const { status } = req.body;
  if (!id)     return res.status(400).json({ error: 'Invalid ID' });
  if (!status) return res.status(400).json({ error: 'status is required' });
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int,     id)
      .input('st', sql.VarChar, status)
      .query('UPDATE Grave SET status = @st WHERE grave_id = @id');
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Grave not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/graves/:id
router.patch('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });
  const { status, row_number, landmark_description, family_group_id } = req.body;
  try {
    const pool = await getPool();
    const sets = [];
    const r2 = pool.request().input('id', sql.Int, id);
    if (status !== undefined)               { r2.input('st', sql.VarChar, status);               sets.push('status = @st'); }
    if (row_number !== undefined)           { r2.input('rn', sql.Int,     row_number);           sets.push('row_number = @rn'); }
    if (landmark_description !== undefined) { r2.input('lm', sql.VarChar, landmark_description); sets.push('landmark_description = @lm'); }
    if (family_group_id !== undefined)      { r2.input('fg', sql.Int,     family_group_id);      sets.push('family_group_id = @fg'); }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    const result = await r2.query(`UPDATE Grave SET ${sets.join(', ')} WHERE grave_id = @id`);
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Grave not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/graves/:id  (only if Available)
router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });
  try {
    const pool = await getPool();
    const check = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT status FROM Grave WHERE grave_id = @id');
    if (!check.recordset.length) return res.status(404).json({ error: 'Grave not found' });
    if (check.recordset[0].status !== 'Available')
      return res.status(409).json({ error: `Cannot delete a grave with status '${check.recordset[0].status}'` });
    await pool.request().input('id', sql.Int, id).query('DELETE FROM Grave WHERE grave_id = @id');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
