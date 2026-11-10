import insertUserSql from "../sql/insert-user.sql"

const selectUserSql = "SELECT name FROM users WHERE id = ? AND provider = ?"
const updateUserSql = "UPDATE users SET name = ? WHERE id = ? AND provider = ?"

export default async function insertUserAndDeleteCachedChars(env, user) {
  const result = await env.DB.prepare(selectUserSql)
    .bind(user.id, user.provider)
    .first()

  const nameInDB = result?.name

  if (!nameInDB) {
    await env.DB.prepare(insertUserSql)
      .bind(user.id, user.name, user.provider)
      .run()
    return
  }

  if (nameInDB === user.name) return

  await env.DB.prepare(updateUserSql)
    .bind(user.name, user.id, user.provider)
    .run()

  // delete cached characters since a user's name has changed
  await env.DB.prepare("DELETE FROM kvs WHERE key = ?").bind("characters").run()
}
