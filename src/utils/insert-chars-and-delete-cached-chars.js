import insertCharacterSql from "../sql/insert-character.sql"

export default async function insertCharsAndDeleteCachedChars(env, characters) {
  const stmt = env.DB.prepare(insertCharacterSql)

  const stmts = characters.map((character) =>
    stmt.bind(
      character.id,
      character.name,
      character.url,
      character.discoverer_id,
      character.discoverer_provider,
      character.discovered_date,
      character.created_at,
      JSON.stringify(character.tags),
    ),
  )

  await env.DB.batch(stmts)

  // delete cached characters since new characters have been added
  await env.DB.prepare("DELETE FROM kvs WHERE key = ?").bind("characters").run()
}
