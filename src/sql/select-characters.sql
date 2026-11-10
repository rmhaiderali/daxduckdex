SELECT
    characters.*,
    users.name AS discoverer
FROM
    characters
    INNER JOIN users ON characters.discoverer_id = users.id
    AND characters.discoverer_provider = users.provider