const express = require('express');
const { getPool, sql } = require('../db');
const { validate, parseId, paginate } = require('../utils');
const router = express.Router();

// Static routes before /:id

// GET /api/deathcases/unburied/list
router.get('/unburied/list', async (_req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT dc.case_id, dc.deceased_name, dc.age, dc.gender,
             dc.date_of_death, dc.status, u.name AS created_by
      FROM DeathCase dc
      JOIN [User] u ON dc.created_by = u.user_id
      LEFT JOIN BurialRecord br ON dc.case_id = br.case_id
      WHERE br.burial_id IS NULL AND dc.status <> 'Cancelled'
      ORDER BY dc.date_of_death`);
    res.json(r.recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/deathcases/gender-stats/summary
router.get('/gender-stats/summary', async (_req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT gender,
             COUNT(*)                       AS total_cases,
             AVG(CAST(age AS FLOAT))        AS avg_age,
             MIN(age)                       AS youngest,
             MAX(age)                       AS oldest,
             SUM(CASE WHEN status='Completed' THEN 1 ELSE 0 END) AS completed,
             SUM(CASE WHEN status='Pending'   THEN 1 ELSE 0 END) AS pending
      FROM DeathCase WHERE age IS NOT NULL
      GROUP BY gender`);
    res.json(r.recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/deathcases?status=&search=&gender=&page=&limit=
router.get('/', async (req, res) => {
  const { status, search, gender } = req.query;
  const { limit, offset, page } = paginate(req.query);
  try {
    const pool = await getPool();
    const r2 = pool.request();
    const where = ['1=1'];
    if (status) { r2.input('st', sql.VarChar, status);        where.push('dc.status = @st'); }
    if (gender) { r2.input('gn', sql.VarChar, gender);        where.push('dc.gender = @gn'); }
    if (search) { r2.input('q',  sql.VarChar, `%${search}%`); where.push('dc.deceased_name LIKE @q'); }
    r2.input('limit', sql.Int, limit).input('offset', sql.Int, offset);

    const whereClause = where.join(' AND ');
    const [data, countRes] = await Promise.all([
      r2.query(`
        SELECT dc.case_id, dc.deceased_name, dc.age, dc.gender,
               dc.date_of_death, dc.status,
               u.name AS created_by, u.user_id AS created_by_id,
               br.burial_id, br.burial_datetime,
               g.grave_code, s.name AS section_name, c.name AS cemetery_name
        FROM DeathCase dc
        JOIN [User] u ON dc.created_by = u.user_id
        LEFT JOIN BurialRecord br ON dc.case_id    = br.case_id
        LEFT JOIN Grave         g  ON br.grave_id   = g.grave_id
        LEFT JOIN Section       s  ON g.section_id  = s.section_id
        LEFT JOIN Cemetery      c  ON s.cemetery_id = c.cemetery_id
        WHERE ${whereClause}
        ORDER BY dc.date_of_death DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`),
      pool.request().query(`SELECT COUNT(*) AS total FROM DeathCase dc WHERE ${whereClause}`),
    ]);
    res.json({ data: data.recordset, total: countRes.recordset[0].total, page, limit });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/deathcases/:id
router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });
  try {
    const pool = await getPool();
    const r = await pool.request().input('id', sql.Int, id).query(`
      SELECT dc.*, u.name AS created_by_name
      FROM DeathCase dc JOIN [User] u ON dc.created_by = u.user_id
      WHERE dc.case_id = @id`);
    if (!r.recordset.length) return res.status(404).json({ error: 'Death case not found' });
    res.json(r.recordset[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/deathcases
router.post('/', async (req, res) => {
  const { deceased_name, age, gender, date_of_death, created_by } = req.body;
  try { validate(['deceased_name', 'gender', 'date_of_death', 'created_by'], req.body); }
  catch (e) { return res.status(400).json({ error: e.message }); }

  // Date must not be in the future
  if (new Date(date_of_death) > new Date())
    return res.status(400).json({ error: 'date_of_death cannot be in the future' });

  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('dn',  sql.VarChar, deceased_name.trim())
      .input('age', sql.Int,     age != null ? parseInt(age) : null)
      .input('gen', sql.VarChar, gender)
      .input('dod', sql.Date,    date_of_death)
      .input('cb',  sql.Int,     created_by)
      .query(`INSERT INTO DeathCase (deceased_name, age, gender, date_of_death, created_by)
              OUTPUT INSERTED.*
              VALUES (@dn, @age, @gen, @dod, @cb)`);
    res.status(201).json(r.recordset[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/deathcases/:id/status
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
      .query('UPDATE DeathCase SET status = @st WHERE case_id = @id');
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Death case not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/deathcases/:id  (only Cancelled cases)
router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });
  try {
    const pool = await getPool();
    const check = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT status FROM DeathCase WHERE case_id = @id');
    if (!check.recordset.length) return res.status(404).json({ error: 'Death case not found' });
    if (check.recordset[0].status !== 'Cancelled')
      return res.status(409).json({ error: 'Only Cancelled cases can be deleted' });
    await pool.request().input('id', sql.Int, id).query('DELETE FROM DeathCase WHERE case_id = @id');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
