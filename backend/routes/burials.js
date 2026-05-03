const express = require('express');
const { getPool, sql } = require('../db');
const { validate, parseId } = require('../utils');
const router = express.Router();

// GET /api/burials
router.get('/', async (_req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT br.burial_id, br.case_id, br.grave_id, br.burial_datetime,
             dc.deceased_name, dc.age, dc.gender, dc.date_of_death,
             g.grave_code, pt.name AS plot_type,
             s.name AS section_name, s.zone_type,
             c.cemetery_id, c.name AS cemetery_name,
             u.name AS confirmed_by, u.user_id AS confirmed_by_id
      FROM BurialRecord br
      JOIN DeathCase dc ON br.case_id      = dc.case_id
      JOIN Grave      g  ON br.grave_id     = g.grave_id
      JOIN PlotType   pt ON g.plot_type_id  = pt.plot_type_id
      JOIN Section    s  ON g.section_id    = s.section_id
      JOIN Cemetery   c  ON s.cemetery_id   = c.cemetery_id
      JOIN [User]     u  ON br.confirmed_by = u.user_id
      ORDER BY br.burial_datetime DESC`);
    res.json(r.recordset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/burials/:id
router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });
  try {
    const pool = await getPool();
    const r = await pool.request().input('id', sql.Int, id).query(`
      SELECT br.*, dc.deceased_name, dc.age, dc.gender, dc.date_of_death,
             g.grave_code, s.name AS section_name,
             c.name AS cemetery_name, c.location,
             u.name AS confirmed_by_name
      FROM BurialRecord br
      JOIN DeathCase dc ON br.case_id      = dc.case_id
      JOIN Grave      g  ON br.grave_id     = g.grave_id
      JOIN Section    s  ON g.section_id    = s.section_id
      JOIN Cemetery   c  ON s.cemetery_id   = c.cemetery_id
      JOIN [User]     u  ON br.confirmed_by = u.user_id
      WHERE br.burial_id = @id`);
    if (!r.recordset.length) return res.status(404).json({ error: 'Burial record not found' });
    res.json(r.recordset[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/burials
router.post('/', async (req, res) => {
  const { case_id, grave_id, burial_datetime, confirmed_by } = req.body;
  try { validate(['case_id', 'grave_id', 'burial_datetime', 'confirmed_by'], req.body); }
  catch (e) { return res.status(400).json({ error: e.message }); }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    // Guard 1: no duplicate burial for this case
    const dupCheck = new sql.Request(transaction);
    const dup = await dupCheck.input('ci', sql.Int, case_id)
      .query('SELECT burial_id FROM BurialRecord WHERE case_id = @ci');
    if (dup.recordset.length) {
      await transaction.rollback();
      return res.status(409).json({ error: 'This death case already has a burial record' });
    }

    // Guard 2: fetch case to validate burial_datetime >= date_of_death
    const caseCheck = new sql.Request(transaction);
    const caseRow = await caseCheck.input('ci', sql.Int, case_id)
      .query('SELECT date_of_death, status FROM DeathCase WHERE case_id = @ci');
    if (!caseRow.recordset.length) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Death case not found' });
    }
    if (caseRow.recordset[0].status === 'Cancelled') {
      await transaction.rollback();
      return res.status(409).json({ error: 'Cannot bury a cancelled death case' });
    }
    const dateOfDeath = new Date(caseRow.recordset[0].date_of_death);
    const burialDate  = new Date(burial_datetime);
    if (burialDate < dateOfDeath) {
      await transaction.rollback();
      return res.status(400).json({ error: 'burial_datetime cannot be before date_of_death' });
    }

    // Guard 3: grave availability
    const graveCheck = new sql.Request(transaction);
    const graveRow = await graveCheck.input('gi', sql.Int, grave_id)
      .query('SELECT status FROM Grave WHERE grave_id = @gi');
    if (!graveRow.recordset.length) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Grave not found' });
    }
    const graveStatus = graveRow.recordset[0].status;
    if (graveStatus === 'Occupied')    { await transaction.rollback(); return res.status(409).json({ error: 'Grave is already occupied' }); }
    if (graveStatus === 'Maintenance') { await transaction.rollback(); return res.status(409).json({ error: 'Grave is under maintenance' }); }

    // Insert burial record
    const ins = new sql.Request(transaction);
    const inserted = await ins
      .input('ci', sql.Int,      case_id)
      .input('gi', sql.Int,      grave_id)
      .input('bd', sql.DateTime, burial_datetime)
      .input('cb', sql.Int,      confirmed_by)
      .query(`INSERT INTO BurialRecord (case_id, grave_id, burial_datetime, confirmed_by)
              OUTPUT INSERTED.* VALUES (@ci, @gi, @bd, @cb)`);

    // Cascade updates
    await new sql.Request(transaction).input('gi', sql.Int, grave_id)
      .query("UPDATE Grave SET status='Occupied' WHERE grave_id=@gi");
    await new sql.Request(transaction).input('ci', sql.Int, case_id)
      .query("UPDATE DeathCase SET status='Completed' WHERE case_id=@ci");
    await new sql.Request(transaction).input('gi', sql.Int, grave_id)
      .query("UPDATE Reservation SET status='Converted' WHERE grave_id=@gi AND status IN ('Pending','Approved')");

    await transaction.commit();
    res.status(201).json(inserted.recordset[0]);
  } catch (e) {
    try { await transaction.rollback(); } catch (_) {}
    res.status(e.status || 500).json({ error: e.message });
  }
});

module.exports = router;
