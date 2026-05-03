-- ============================================================
--  QabarNuma  |  Normalized BCNF Schema
--  Deliverable III  -  Final Submission
-- ============================================================

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'QabarNuma')
BEGIN
    CREATE DATABASE QabarNuma;
END
GO
USE QabarNuma;
GO

-- ============================================================
--  1. FAMILYGROUP  (new table – resolves missing-entity issue)
--     Eliminates the bare family_group_id integer that appeared
--     in both Grave and Reservation without a home table.
-- ============================================================
CREATE TABLE FamilyGroup (
    family_group_id   INT           IDENTITY(100,1) PRIMARY KEY,
    group_name        VARCHAR(150)  NOT NULL,
    contact_person    VARCHAR(100)  NOT NULL,
    contact_phone     VARCHAR(20)   NOT NULL,
    contact_email     VARCHAR(150)  NULL,
    notes             VARCHAR(500)  NULL,
    created_at        DATETIME      DEFAULT GETDATE()
);
GO

-- ============================================================
--  2. CEMETERY
-- ============================================================
CREATE TABLE Cemetery (
    cemetery_id  INT           IDENTITY(1,1) PRIMARY KEY,
    name         VARCHAR(150)  NOT NULL,
    location     VARCHAR(300)  NOT NULL,
    type         VARCHAR(50)   NOT NULL   CHECK (type IN ('Public','Private','Mosque','Military')),
    status       VARCHAR(20)   NOT NULL   CHECK (status IN ('Active','Inactive','Full'))
                               DEFAULT 'Active'
);
GO

-- ============================================================
--  3. SECTION
-- ============================================================
CREATE TABLE Section (
    section_id    INT           IDENTITY(1,1) PRIMARY KEY,
    cemetery_id   INT           NOT NULL  REFERENCES Cemetery(cemetery_id),
    name          VARCHAR(100)  NOT NULL,
    zone_type     VARCHAR(50)   NOT NULL  CHECK (zone_type IN ('Adult','Child','VIP','Unknown')),
    capacity      INT           NOT NULL  CHECK (capacity > 0)
);
GO

-- ============================================================
--  4. PLOTTYPE
-- ============================================================
CREATE TABLE PlotType (
    plot_type_id      INT          IDENTITY(1,1) PRIMARY KEY,
    name              VARCHAR(80)  NOT NULL  UNIQUE,
    max_slots         INT          NOT NULL  CHECK (max_slots > 0),
    size_description  VARCHAR(200) NULL
);
GO

-- ============================================================
--  5. GRAVE
-- ============================================================
CREATE TABLE Grave (
    grave_id              INT           IDENTITY(1,1) PRIMARY KEY,
    section_id            INT           NOT NULL  REFERENCES Section(section_id),
    plot_type_id          INT           NOT NULL  REFERENCES PlotType(plot_type_id),
    grave_code            VARCHAR(30)   NOT NULL  UNIQUE,
    status                VARCHAR(20)   NOT NULL
                          CHECK (status IN ('Available','Occupied','Reserved','Maintenance'))
                          DEFAULT 'Available',
    row_number            INT           NOT NULL,
    landmark_description  VARCHAR(300)  NULL,
    family_group_id       INT           NULL      REFERENCES FamilyGroup(family_group_id)
);
GO

-- ============================================================
--  6. USER
-- ============================================================
CREATE TABLE [User] (
    user_id     INT           IDENTITY(1,1) PRIMARY KEY,
    name        VARCHAR(100)  NOT NULL,
    cnic        VARCHAR(20)   NOT NULL  UNIQUE,
    phone       VARCHAR(20)   NOT NULL,
    email       VARCHAR(150)  NULL      UNIQUE,
    role        VARCHAR(30)   NOT NULL
                CHECK (role IN ('Admin','Manager','Coordinator','Staff')),
    cemetery_id INT           NULL      REFERENCES Cemetery(cemetery_id)
);
GO

-- ============================================================
--  7. DEATHCASE
-- ============================================================
CREATE TABLE DeathCase (
    case_id        INT           IDENTITY(1,1) PRIMARY KEY,
    deceased_name  VARCHAR(150)  NOT NULL,
    age            INT           NULL  CHECK (age >= 0 AND age <= 150),
    gender         VARCHAR(10)   NOT NULL  CHECK (gender IN ('Male','Female','Other')),
    date_of_death  DATE          NOT NULL,
    created_by     INT           NOT NULL  REFERENCES [User](user_id),
    status         VARCHAR(20)   NOT NULL
                   CHECK (status IN ('Pending','Scheduled','Completed','Cancelled'))
                   DEFAULT 'Pending'
);
GO

-- ============================================================
--  8. FUNERALSERVICE
-- ============================================================
CREATE TABLE FuneralService (
    service_id           INT           IDENTITY(1,1) PRIMARY KEY,
    case_id              INT           NOT NULL  REFERENCES DeathCase(case_id),
    service_type         VARCHAR(80)   NOT NULL
                         CHECK (service_type IN ('Ghusl','Kafan','Grave Digging',
                                                 'Burial Prep','Transport','Janaza')),
    status               VARCHAR(20)   NOT NULL
                         CHECK (status IN ('Pending','In Progress','Completed','Cancelled'))
                         DEFAULT 'Pending',
    assigned_staff_id    INT           NULL      REFERENCES [User](user_id),
    scheduled_datetime   DATETIME      NULL,
    completion_datetime  DATETIME      NULL
);
GO

-- ============================================================
--  9. RESERVATION
-- ============================================================
CREATE TABLE Reservation (
    reservation_id   INT          IDENTITY(1,1) PRIMARY KEY,
    grave_id         INT          NOT NULL  REFERENCES Grave(grave_id),
    reserved_by      INT          NOT NULL  REFERENCES [User](user_id),
    reservation_date DATE         NOT NULL  DEFAULT CAST(GETDATE() AS DATE),
    status           VARCHAR(20)  NOT NULL
                     CHECK (status IN ('Pending','Approved','Rejected','Converted','Expired'))
                     DEFAULT 'Pending',
    family_group_id  INT          NULL      REFERENCES FamilyGroup(family_group_id),
    number_of_slots  INT          NOT NULL  DEFAULT 1  CHECK (number_of_slots > 0)
);
GO

-- ============================================================
-- 10. BURIALRECORD
--     BCNF FIX: cemetery_id REMOVED.
--     It was functionally determined by grave_id
--     (grave_id → section_id → cemetery_id), violating BCNF
--     because grave_id is NOT a superkey of BurialRecord.
--     Cemetery is now obtained via JOIN: BurialRecord → Grave
--     → Section → Cemetery.
-- ============================================================
CREATE TABLE BurialRecord (
    burial_id         INT       IDENTITY(1,1) PRIMARY KEY,
    case_id           INT       NOT NULL  UNIQUE  REFERENCES DeathCase(case_id),  -- one burial per death case
    grave_id          INT       NOT NULL          REFERENCES Grave(grave_id),
    burial_datetime   DATETIME  NOT NULL,
    confirmed_by      INT       NOT NULL  REFERENCES [User](user_id)
);
GO

-- ============================================================
--  INDEXES
-- ============================================================
CREATE INDEX IX_Section_Cemetery   ON Section(cemetery_id);
CREATE INDEX IX_Grave_Section      ON Grave(section_id);
CREATE INDEX IX_Grave_Status       ON Grave(status);
CREATE INDEX IX_DeathCase_Status   ON DeathCase(status);
CREATE INDEX IX_BurialRecord_Case  ON BurialRecord(case_id);
CREATE INDEX IX_BurialRecord_Grave ON BurialRecord(grave_id);
CREATE INDEX IX_FuneralSvc_Case    ON FuneralService(case_id);
CREATE INDEX IX_Reservation_Grave  ON Reservation(grave_id);
GO

-- ============================================================
--  SEED DATA  (Phase 2 data, adapted to normalized schema)
-- ============================================================
INSERT INTO FamilyGroup (group_name, contact_person, contact_phone) VALUES
('Khan Family',    'Imran Khan',    '0300-9876543'),
('Siddiq Family',  'Tariq Siddiq',  '0301-8765432');

INSERT INTO Cemetery (name, location, type, status) VALUES
('Model Town Qabristan',    'Model Town, Lahore',      'Public',  'Active'),
('Miani Sahib Qabristan',   'Sheranwala Gate, Lahore', 'Public',  'Active'),
('DHA Phase 5 Cemetery',    'DHA Phase 5, Lahore',     'Private', 'Active'),
('Masjid Al-Noor Cemetery', 'Gulberg III, Lahore',     'Mosque',  'Active');

INSERT INTO Section (cemetery_id, name, zone_type, capacity) VALUES
(1, 'Block A',       'Adult', 200),
(1, 'Block B',       'Child', 100),
(2, 'North Section', 'Adult', 300),
(2, 'South Section', 'Adult', 250),
(3, 'Zone 1',        'Adult', 150),
(4, 'Main Block',    'Adult',  80);

INSERT INTO PlotType (name, max_slots, size_description) VALUES
('Standard', 1, 'Single burial plot, 6x3 feet'),
('Family',   4, 'Family plot up to 4 burials, 12x6 feet'),
('Child',    1, 'Smaller plot for children, 4x2 feet');

INSERT INTO Grave (section_id, plot_type_id, grave_code, status, row_number, landmark_description, family_group_id) VALUES
(1, 1, 'MT-A-001', 'Available',   1, 'Near main entrance gate',    NULL),
(1, 1, 'MT-A-002', 'Occupied',    1, 'Under large neem tree',      NULL),
(1, 2, 'MT-A-003', 'Available',   2, 'Corner plot near boundary',  1),
(1, 1, 'MT-A-004', 'Reserved',    2, 'Near water tap',             NULL),
(2, 3, 'MT-B-001', 'Available',   1, 'Near children section gate', NULL),
(3, 1, 'MS-N-001', 'Occupied',    1, 'Central area',               NULL),
(3, 1, 'MS-N-002', 'Available',   1, 'Near boundary wall',         NULL),
(3, 2, 'MS-N-003', 'Occupied',    2, 'Near large shisham tree',    2),
(5, 1, 'DH-Z1-001','Available',   1, 'Near parking area',          NULL),
(5, 2, 'DH-Z1-002','Maintenance', 1, 'Currently under repair',     NULL),
(4, 1, 'MS-S-001', 'Occupied',    1, 'Near wudu area',             NULL),
(6, 1, 'AN-M-001', 'Available',   1, 'Adjacent to masjid door',    NULL);

INSERT INTO [User] (name, cnic, phone, email, role, cemetery_id) VALUES
('Ahmed Raza',     '35201-1234567-1', '0300-1234567', 'ahmed@qabarnuma.pk',  'Admin',       NULL),
('Bilal Khan',     '35202-2345678-2', '0301-2345678', 'bilal@qabarnuma.pk',  'Manager',     1),
('Sara Malik',     '35203-3456789-3', '0302-3456789', 'sara@qabarnuma.pk',   'Coordinator', 2),
('Usman Ali',      '35204-4567890-4', '0303-4567890', 'usman@qabarnuma.pk',  'Staff',       1),
('Khalid Mehmood', '35205-5678901-5', '0304-5678901', 'khalid@qabarnuma.pk', 'Staff',       2),
('Fatima Noor',    '35206-6789012-6', '0305-6789012', 'fatima@qabarnuma.pk', 'Manager',     3),
('Zubair Ahmed',   '35207-7890123-7', '0306-7890123', 'zubair@qabarnuma.pk', 'Staff',       3),
('Hira Baig',      '35208-8901234-8', '0307-8901234', 'hira@qabarnuma.pk',   'Coordinator', 4);

INSERT INTO DeathCase (deceased_name, age, gender, date_of_death, created_by, status) VALUES
('Muhammad Tariq',  65, 'Male',   '2025-01-10', 2, 'Completed'),
('Zainab Bibi',     72, 'Female', '2025-01-15', 3, 'Completed'),
('Hassan Ali',      45, 'Male',   '2025-02-03', 2, 'Completed'),
('Amina Khatoon',   80, 'Female', '2025-02-20', 3, 'Scheduled'),
('Abdullah Khan',    5, 'Male',   '2025-03-01', 2, 'Pending'),
('Ruqayyah Siddiq', 58, 'Female', '2025-03-10', 6, 'Completed'),
('Tariq Mehmood',   70, 'Male',   '2025-03-18', 8, 'Scheduled'),
('Nasreen Akhtar',  55, 'Female', '2025-03-22', 3, 'Pending'),
('Abdul Hameed',    68, 'Male',   '2025-03-25', 2, 'Pending');

INSERT INTO FuneralService (case_id, service_type, status, assigned_staff_id, scheduled_datetime, completion_datetime) VALUES
(1,'Ghusl',        'Completed',   4,'2025-01-10 09:00','2025-01-10 10:00'),
(1,'Kafan',        'Completed',   4,'2025-01-10 10:00','2025-01-10 11:00'),
(1,'Grave Digging','Completed',   5,'2025-01-10 08:00','2025-01-10 09:00'),
(1,'Burial Prep',  'Completed',   5,'2025-01-10 11:00','2025-01-10 12:00'),
(2,'Ghusl',        'Completed',   5,'2025-01-15 10:00','2025-01-15 11:00'),
(2,'Grave Digging','Completed',   4,'2025-01-15 08:00','2025-01-15 09:00'),
(3,'Ghusl',        'Completed',   4,'2025-02-03 09:00','2025-02-03 10:00'),
(3,'Transport',    'Completed',   5,'2025-02-03 11:00','2025-02-03 12:30'),
(4,'Ghusl',        'Completed',   4,'2025-02-20 09:00','2025-02-20 10:30'),
(4,'Grave Digging','Pending',     5,'2025-02-20 08:00', NULL),
(5,'Ghusl',        'Pending',     5, NULL,               NULL),
(6,'Ghusl',        'Completed',   7,'2025-03-10 09:00','2025-03-10 10:00'),
(6,'Grave Digging','Completed',   7,'2025-03-10 07:00','2025-03-10 08:30'),
(7,'Ghusl',        'Pending',     NULL, NULL,             NULL);

INSERT INTO Reservation (grave_id, reserved_by, reservation_date, status, family_group_id, number_of_slots) VALUES
(4,  2,'2025-01-05','Approved',  NULL, 1),
(3,  3,'2025-01-08','Converted', 1,    2),
(9,  6,'2025-02-15','Approved',  NULL, 1),
(12, 8,'2025-03-20','Pending',   NULL, 1),
(1,  3, CAST(GETDATE() AS DATE),'Pending', NULL, 1);

INSERT INTO BurialRecord (case_id, grave_id, burial_datetime, confirmed_by) VALUES
(1,  2, '2025-01-10 12:00', 2),
(2,  6, '2025-01-15 13:00', 3),
(3,  8, '2025-02-03 14:00', 3),
(6, 11, '2025-03-10 11:30', 6);
GO
