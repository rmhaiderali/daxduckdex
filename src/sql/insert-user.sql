INSERT INTO
    users (id, name, provider)
VALUES
    (?, ?, ?)
    -- ON CONFLICT (id, provider) DO
    -- UPDATE
    -- SET name = EXCLUDED.name