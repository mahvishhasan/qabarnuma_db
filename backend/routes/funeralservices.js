const express = require('express');
const { getPool, sql } = require('../db');
const { validate, parseId, paginate } = require('../utils');
const router = express.Router();

// Static routes before /:id

// GET /api/funeralservices/stats/staff-performance
router.get('/stats/staff-performance', async (_req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT u.user_id, u.name AS staff_name, u.role,
             c.name AS assigned_cemetery,
             COUNT(fs.service_id) AS total_assigned,
             SUM(CASE WHEN fs.status='Completed'   THEN 1 ELSE 0 END) AS completed,
             SUM(CASE WHEN fs.status='Pending'     THEN 1 ELSE 0 END) AS pending,
             SUM(CASE WHEN fs.status='In Progress' THEN 1 ELSE 0 END) AS in_progress,
             SUM(CASE WHEN fs.status='Cancelled'   THEN 1 ELSE 0 END) AS cancelled,
             CAST(100.0 * SUM(CASE WHEN fs.status='Completed' THEN 1 ELSE 0 END)
               / NULLIF(COUNT(fs.service_id),0) AS DECIMAL(5,2)) AS completion_rate
      FROM [User] u
      LEFT JOIN FuneralService fs ON u.user_id     = fs.assigned_staff_id
      LEFT JOIN Cemetery        c  ON u.cemetery_id = c.cemetery_id
      WHERE u.role = 'Staff'
      GROUP BY u.user_id, u.name, u.role, c.name
      ORDER BY completed DESC, total_assigned DESC`);
    res.json(r.recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/funeralservices?case_id=&status=&staff_id=&page=&limit=
router.get('/', async (req, res) => {
  const { case_id, status, staff_id } = req.query;
  const { limit, offset, page } = paginate(req.query);
  try {
    const pool = await getPool();
    const r2 = pool.request();
    const where = ['1=1'];
    if (case_id)  { r2.input('ci',   sql.Int,     case_id);  where.push('fs.case_id = @ci'); }
    if (status)   { r2.input('st',   sql.VarChar, status);   where.push('fs.status = @st'); }
    if (staff_id) { r2.input('asid', sql.Int,     staff_id); where.push('fs.assigned_staff_id = @asid'); }
    r2.input('limit', sql.Int, limit).input('offset', sql.Int, offset);

    const whereClause = where.join(' AND ');
    const [data, countRes] = await Promise.all([
      r2.query(`
        SELECT fs.service_id, fs.case_id, fs.service_type, fs.status,
               fs.scheduled_datetime, fs.completion_datetime,
               dc.deceased_name, dc.date_of_death,
               u.user_id AS staff_id, u.name AS assigned_staff, u.phone AS staff_phone
        FROM FuneralService fs
        JOIN DeathCase dc ON fs.case_id = dc.case_id
        LEFT JOIN [User] u ON fs.assigned_staff_id = u.user_id
        WHERE ${whereClause}
        ORDER BY fs.scheduled_datetime DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`),
      pool.request().query(`SELECT COUNT(*) AS total FROM FuneralService fs WHERE ${whereClause}`),
    ]);
    res.json({ data: data.recordset, total: countRes.recordset[0].total, page, limit });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/funeralservices/:id
router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });
  try {
    const pool = await getPool();
    const r = await pool.request().input('id', sql.Int, id).query(`
      SELECT fs.*, dc.deceased_name, u.name AS assigned_staff_name
      FROM FuneralService fs
      JOIN DeathCase dc ON fs.case_id = dc.case_id
      LEFT JOIN [User] u ON fs.assigned_staff_id = u.user_id
      WHERE fs.service_id = @id`);
    if (!r.recordset.length) return res.status(404).json({ error: 'Service not found' });
    res.json(r.recordset[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/funeralservices
router.post('/', async (req, res) => {
  const { case_id, service_type, assigned_staff_id, scheduled_datetime } = req.body;
  try { validate(['case_id', 'service_type'], req.body); }
  catch (e) { return res.status(400).json({ error: e.message }); }

  try {
    const pool = await getPool();

    // Validate assigned_staff_id actually has role='Staff'
    if (assigned_staff_id) {
      const staffCheck = await pool.request()
        .input('sid', sql.Int, assigned_staff_id)
        .query("SELECT role FROM [User] WHERE user_id = @sid");
      if (!staffCheck.recordset.length)
        return res.status(404).json({ error: 'Assigned user not found' });
      if (staffCheck.recordset[0].role !== 'Staff')
        return res.status(409).json({ error: `Only users with role 'Staff' can be assigned to funeral services (assigned user has role '${staffCheck.recordset[0].role}')` });
    }

    const r = await pool.request()
      .input('ci',   sql.Int,      case_id)
      .input('st',   sql.VarChar,  service_type)
      .input('asid', sql.Int,      assigned_staff_id || null)
      .input('sd',   sql.DateTime, scheduled_datetime || null)
      .query(`INSERT INTO FuneralService (case_id, service_type, status, assigned_staff_id, scheduled_datetime)
              OUTPUT INSERTED.*
              VALUES (@ci, @st, 'Pending', @asid, @sd)`);

    if (assigned_staff_id) {
      await pool.request().input('ci', sql.Int, case_id)
        .query("UPDATE DeathCase SET status='Scheduled' WHERE case_id=@ci AND status='Pending'");
    }
    res.status(201).json(r.recordset[0]);
  } catch (e) {
    // Unique constraint on (case_id, service_type)
    if (e.number === 2627 || e.number === 2601)
      return res.status(409).json({ error: `A '${req.body.service_type}' service already exists for this case` });
    res.status(e.status || 500).json({ error: e.message });
  }
});

// PATCH /api/funeralservices/:id
router.patch('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });
  const { status, assigned_staff_id, scheduled_datetime } = req.body;
  try {
    const pool = await getPool();

    // Validate staff role if reassigning
    if (assigned_staff_id != null) {
      const staffCheck = await pool.request()
        .input('sid', sql.Int, assigned_staff_id)
        .query("SELECT role FROM [User] WHERE user_id = @sid");
      if (!staffCheck.recordset.length)
        return res.status(404).json({ error: 'Assigned user not found' });
      if (staffCheck.recordset[0].role !== 'Staff')
        return res.status(409).json({ error: `Only users with role 'Staff' can be assigned` });
    }

    const sets = [];
    const r2 = pool.request().input('id', sql.Int, id);
    if (status !== undefined) {
      r2.input('st', sql.VarChar, status);
      sets.push('status = @st');
      if (status === 'Completed') sets.push('completion_datetime = GETDATE()');
    }
    if (assigned_staff_id !== undefined) { r2.input('asid', sql.Int,     assigned_staff_id); sets.push('assigned_staff_id = @asid'); }
    if (scheduled_datetime !== undefined){ r2.input('sd',   sql.DateTime, scheduled_datetime); sets.push('scheduled_datetime = @sd'); }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    const result = await r2.query(`UPDATE FuneralService SET ${sets.join(', ')} WHERE service_id = @id`);
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Service not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
