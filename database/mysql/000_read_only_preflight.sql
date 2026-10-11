-- Growth OS Hostinger MariaDB read-only schema inventory.
-- Run manually in phpMyAdmin with the designated database selected.
-- No writes, migrations, locks, or stored procedures.
SELECT VERSION() AS server_version, DATABASE() AS selected_database;
SELECT TABLE_NAME, ENGINE, TABLE_ROWS
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME;
SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND LEFT(TABLE_NAME, 7) = 'growth_'
ORDER BY TABLE_NAME;
SELECT TRIGGER_NAME, EVENT_OBJECT_TABLE, EVENT_MANIPULATION
FROM information_schema.TRIGGERS
WHERE TRIGGER_SCHEMA = DATABASE()
ORDER BY TRIGGER_NAME;
SELECT @@character_set_database AS db_charset, @@collation_database AS db_collation;
