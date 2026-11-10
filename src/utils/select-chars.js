import selectCharactersSql from "../sql/select-characters.sql"

export default async function selectChars(env) {
  const { results: characters } =
    await env.DB.prepare(selectCharactersSql).all()

  for (const character of characters) {
    character.tags = JSON.parse(character.tags)
  }

  const count = characters.length

  return { success: true, count, characters }
}
