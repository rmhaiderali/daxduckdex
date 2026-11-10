CREATE TABLE
    IF NOT EXISTS characters (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL UNIQUE,
        discoverer_id TEXT NOT NULL,
        discoverer_provider TEXT NOT NULL,
        discovered_date DATE NOT NULL CHECK (date (discovered_date) IS NOT NULL),
        created_at DATETIME NOT NULL CHECK (datetime (created_at) IS NOT NULL),
        tags TEXT NOT NULL DEFAULT "[]" CHECK (json_valid (tags)),
        FOREIGN KEY (discoverer_id, discoverer_provider) REFERENCES users (id, provider)
    )