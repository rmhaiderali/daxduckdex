import insertUserSql from "../sql/insert-user.sql"

export default async function insertUsers(env, users) {
  const stmt = env.DB.prepare(insertUserSql)

  const stmts = users.map((user) =>
    stmt.bind(user.id, user.name, user.provider),
  )

  await env.DB.batch(stmts)
}
