-- ============================================================
--  QabarNuma — Schema Integrity Fixes
--  Safe to run multiple times (uses IF NOT EXISTS checks)
-- ============================================================
USE QabarNuma;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'UQ_BurialRecord_Grave' AND object_id = OBJECT_ID('BurialRecord')
)
BEGIN
  ALTER TABLE BurialRecord ADD CONSTRAINT UQ_BurialRecord_Grave UNIQUE (grave_id);
  PRINT 'Added UQ_BurialRecord_Grave';
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'UQ_FuneralService_CaseType' AND object_id = OBJECT_ID('FuneralService')
)
BEGIN
  ALTER TABLE FuneralService ADD CONSTRAINT UQ_FuneralService_CaseType UNIQUE (case_id, service_type);
  PRINT 'Added UQ_FuneralService_CaseType';
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'UQ_Section_CemeteryName' AND object_id = OBJECT_ID('Section')
)
BEGIN
  ALTER TABLE Section ADD CONSTRAINT UQ_Section_CemeteryName UNIQUE (cemetery_id, name);
  PRINT 'Added UQ_Section_CemeteryName';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Reservation_Status')
  CREATE INDEX IX_Reservation_Status    ON Reservation(status);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_FuneralSvc_Status')
  CREATE INDEX IX_FuneralSvc_Status     ON FuneralService(status);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_User_Role')
  CREATE INDEX IX_User_Role             ON [User](role);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_DeathCase_DateOfDeath')
  CREATE INDEX IX_DeathCase_DateOfDeath ON DeathCase(date_of_death);
GO

PRINT 'All schema fixes applied.';
GO
