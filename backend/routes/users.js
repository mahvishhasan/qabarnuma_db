const express = require('express');
const { getPool, sql } = require('../db');
const { validate, parseId } = require('../utils');
const router = express.Router();

// GET /api/users?role=&cemetery_id=&search=
router.get('/', async (req, res) => {
  const { role, cemetery_id, search } = req.query;
  try {
    const pool = await getPool();
    const r2 = pool.request();
    const where = ['1=1'];
    if (role)        { r2.input('r',   sql.VarChar, role);          where.push('u.role = @r'); }
    if (cemetery_id) { r2.input('cid', sql.Int,     cemetery_id);   where.push('u.cemetery_id = @cid'); }
    if (search)      { r2.input('q',   sql.VarChar, `%${search}%`); where.push('(u.name LIKE @q OR u.cnic LIKE @q OR u.phone LIKE @q)'); }
    const r = await r2.query(`
      SELECT
        u.user_id, u.name, u.cnic, u.phone, u.email, u.role,
        u.cemetery_id,
        c.name AS cemetery_name
      FROM [User] u
      LEFT JOIN Cemetery c ON u.cemetery_id = c.cemetery_id
      WHERE ${where.join(' AND ')}
      ORDER BY u.role, u.name`);
    res.json(r.recordset);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/users/:id
router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT u.*, c.name AS cemetery_name
        FROM [User] u
        LEFT JOIN Cemetery c ON u.cemetery_id = c.cemetery_id
        WHERE u.user_id = @id`);
    if (!r.recordset.length) return res.status(404).json({ error: 'User not found' });
    res.json(r.recordset[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/users
router.post('/', async (req, res) => {
  const { name, cnic, phone, email, role, cemetery_id } = req.body;
  try {
    validate(['name', 'cnic', 'phone', 'role'], req.body);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('n',   sql.VarChar, name.trim())
      .input('cn',  sql.VarChar, cnic.trim())
      .input('ph',  sql.VarChar, phone.trim())
      .input('em',  sql.VarChar, email || null)
      .input('rl',  sql.VarChar, role)
      .input('cid', sql.Int,     cemetery_id || null)
      .query(`INSERT INTO [User] (name, cnic, phone, email, role, cemetery_id)
              OUTPUT INSERTED.*
              VALUES (@n, @cn, @ph, @em, @rl, @cid)`);
    res.status(201).json(r.recordset[0]);
  } catch (e) {
    if (e.number === 2627 || e.number === 2601) {
      return res.status(409).json({ error: 'A user with this CNIC already exists' });
    }
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/users/:id
router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
  const { name, phone, email, role, cemetery_id } = req.body;
  try {
    validate(['name', 'phone', 'role'], req.body);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id',  sql.Int,     id)
      .input('n',   sql.VarChar, name)
      .input('ph',  sql.VarChar, phone)
      .input('em',  sql.VarChar, email || null)
      .input('rl',  sql.VarChar, role)
      .input('cid', sql.Int,     cemetery_id || null)
      .query('UPDATE [User] SET name=@n, phone=@ph, email=@em, role=@rl, cemetery_id=@cid WHERE user_id=@id');
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
