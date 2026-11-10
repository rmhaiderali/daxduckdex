INSERT INTO
    kvs (key, value)
VALUES
    (?, ?) ON CONFLICT (key) DO
UPDATE
SET
    value = EXCLUDED.value