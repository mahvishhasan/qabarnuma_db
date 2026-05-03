require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const path     = require('path');

const cemeteriesRouter      = require('./routes/cemeteries');
const sectionsRouter        = require('./routes/sections');
const plotTypesRouter       = require('./routes/plottypes');
const gravesRouter          = require('./routes/graves');
const familyGroupsRouter    = require('./routes/familygroups');
const deathCasesRouter      = require('./routes/deathcases');
const burialRecordsRouter   = require('./routes/burials');
const reservationsRouter    = require('./routes/reservations');
const funeralServicesRouter = require('./routes/funeralservices');
const usersRouter           = require('./routes/users');
const reportsRouter         = require('./routes/reports');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/api/cemeteries',      cemeteriesRouter);
app.use('/api/sections',        sectionsRouter);
app.use('/api/plottypes',       plotTypesRouter);
app.use('/api/graves',          gravesRouter);
app.use('/api/familygroups',    familyGroupsRouter);
app.use('/api/deathcases',      deathCasesRouter);
app.use('/api/burials',         burialRecordsRouter);
app.use('/api/reservations',    reservationsRouter);
app.use('/api/funeralservices', funeralServicesRouter);
app.use('/api/users',           usersRouter);
app.use('/api/reports',         reportsRouter);

app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', time: new Date() })
);

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: `No API route: ${req.method} ${req.originalUrl}` });
  }
  next();
});

app.get('/{*path}', (_req, res) =>
  res.sendFile(path.join(__dirname, '../frontend/index.html'))
);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () =>
  console.log(`QabarNuma server running on http://localhost:${PORT}`)
);