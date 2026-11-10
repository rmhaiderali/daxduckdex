CREATE TABLE
    IF NOT EXISTS users (
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        provider TEXT NOT NULL CHECK (provider IN ("reddit", "discord")),
        PRIMARY KEY (id, provider)
    )