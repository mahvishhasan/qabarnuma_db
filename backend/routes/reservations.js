const express = require('express');
const { getPool, sql } = require('../db');
const { validate, parseId } = require('../utils');
const router = express.Router();

// GET /api/reservations?status=&cemetery=&reserved_by=
router.get('/', async (req, res) => {
  const { status, cemetery, reserved_by } = req.query;
  try {
    const pool = await getPool();
    const r2 = pool.request();
    const where = ['1=1'];
    if (status)      { r2.input('st',  sql.VarChar, status);      where.push('r.status = @st'); }
    if (cemetery)    { r2.input('cem', sql.Int,     cemetery);    where.push('c.cemetery_id = @cem'); }
    if (reserved_by) { r2.input('rb',  sql.Int,     reserved_by); where.push('r.reserved_by = @rb'); }
    const r = await r2.query(`
      SELECT r.reservation_id, r.reservation_date, r.status AS reservation_status,
             r.number_of_slots, g.grave_id, g.grave_code, g.status AS grave_status,
             s.name AS section_name, s.zone_type,
             c.cemetery_id, c.name AS cemetery_name,
             u.user_id AS reserved_by_id, u.name AS reserved_by,
             fg.family_group_id, fg.group_name AS family_group
      FROM Reservation r
      JOIN Grave        g  ON r.grave_id       = g.grave_id
      JOIN Section      s  ON g.section_id     = s.section_id
      JOIN Cemetery     c  ON s.cemetery_id    = c.cemetery_id
      JOIN [User]       u  ON r.reserved_by    = u.user_id
      LEFT JOIN FamilyGroup fg ON r.family_group_id = fg.family_group_id
      WHERE ${where.join(' AND ')}
      ORDER BY r.reservation_date DESC`);
    res.json(r.recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/reservations/:id
router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });
  try {
    const pool = await getPool();
    const r = await pool.request().input('id', sql.Int, id).query(`
      SELECT r.*, g.grave_code, s.name AS section_name,
             c.name AS cemetery_name, u.name AS reserved_by_name,
             fg.group_name AS family_group_name
      FROM Reservation r
      JOIN Grave    g  ON r.grave_id    = g.grave_id
      JOIN Section  s  ON g.section_id  = s.section_id
      JOIN Cemetery c  ON s.cemetery_id = c.cemetery_id
      JOIN [User]   u  ON r.reserved_by = u.user_id
      LEFT JOIN FamilyGroup fg ON r.family_group_id = fg.family_group_id
      WHERE r.reservation_id = @id`);
    if (!r.recordset.length) return res.status(404).json({ error: 'Reservation not found' });
    res.json(r.recordset[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/reservations
router.post('/', async (req, res) => {
  const { grave_id, reserved_by, family_group_id, number_of_slots } = req.body;
  try { validate(['grave_id', 'reserved_by'], req.body); }
  catch (e) { return res.status(400).json({ error: e.message }); }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const graveCheck = new sql.Request(transaction);
    const graveRow = await graveCheck.input('gi', sql.Int, grave_id)
      .query('SELECT status FROM Grave WHERE grave_id = @gi');
    if (!graveRow.recordset.length) { await transaction.rollback(); return res.status(404).json({ error: 'Grave not found' }); }
    if (graveRow.recordset[0].status !== 'Available') {
      await transaction.rollback();
      return res.status(409).json({ error: `Grave is '${graveRow.recordset[0].status}' and cannot be reserved` });
    }
    const ins = new sql.Request(transaction);
    const inserted = await ins
      .input('gi', sql.Int, grave_id)
      .input('rb', sql.Int, reserved_by)
      .input('fg', sql.Int, family_group_id || null)
      .input('ns', sql.Int, number_of_slots || 1)
      .query(`INSERT INTO Reservation (grave_id, reserved_by, family_group_id, number_of_slots)
              OUTPUT INSERTED.* VALUES (@gi, @rb, @fg, @ns)`);
    await new sql.Request(transaction).input('gi', sql.Int, grave_id)
      .query("UPDATE Grave SET status='Reserved' WHERE grave_id=@gi");
    await transaction.commit();
    res.status(201).json(inserted.recordset[0]);
  } catch (e) {
    try { await transaction.rollback(); } catch (_) {}
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/reservations/:id/status
router.patch('/:id/status', async (req, res) => {
  const id = parseId(req.params.id);
  const { status } = req.body;
  if (!id)     return res.status(400).json({ error: 'Invalid ID' });
  if (!status) return res.status(400).json({ error: 'status is required' });

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const fetchReq = new sql.Request(transaction);
    const rv = await fetchReq.input('id', sql.Int, id)
      .query('SELECT grave_id, status AS current_status FROM Reservation WHERE reservation_id = @id');
    if (!rv.recordset.length) { await transaction.rollback(); return res.status(404).json({ error: 'Reservation not found' }); }
    const { grave_id } = rv.recordset[0];
    await new sql.Request(transaction).input('id', sql.Int, id).input('st', sql.VarChar, status)
      .query('UPDATE Reservation SET status = @st WHERE reservation_id = @id');
    if (status === 'Rejected' || status === 'Expired') {
      await new sql.Request(transaction).input('gi', sql.Int, grave_id)
        .query("UPDATE Grave SET status='Available' WHERE grave_id=@gi AND status='Reserved'");
    }
    await transaction.commit();
    res.json({ success: true });
  } catch (e) {
    try { await transaction.rollback(); } catch (_) {}
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
