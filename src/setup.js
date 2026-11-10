import insertUsers from "./utils/insert-users.js"
import insertChars from "./utils/insert-chars-and-delete-cached-chars.js"

import userids from "../scripts/userids.json"
import { characters } from "../public/api-old/characters.json"

import createKvsTableSql from "./sql/create-kvs-table.sql"
import createUsersTableSql from "./sql/create-users-table.sql"
import createCharactersTableSql from "./sql/create-characters-table.sql"

for (const character of characters) {
  character.discoverer_id ??= userids[character.discoverer]
  character.discoverer_provider ??= "reddit"
}

const userTupleFromCharacters = Array.from(
  new Set(characters.map((u) => u.discoverer_provider + "/" + u.discoverer)),
)

const users = userTupleFromCharacters.map((tuple) => {
  const [provider, name] = tuple.split("/")

  const u = characters.find(
    (u) => u.discoverer === name && u.discoverer_provider === provider,
  )

  return {
    name: u.discoverer,
    id: u.discoverer_id,
    provider: u.discoverer_provider,
  }
})

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url)

      // async function readAssetFile(path, format) {
      //   const res = await env.ASSETS.fetch("https://assets.local" + path)
      //   return format ? res[format]() : res
      // }

      if (url.pathname === "/setup") {
        await env.DB.prepare(createKvsTableSql).run()
        await env.DB.prepare(createUsersTableSql).run()
        await env.DB.prepare(createCharactersTableSql).run()

        await insertUsers(env, users)
        await insertChars(env, characters)

        return Response.json({ success: true })
      }

      return new Response("Not Found", { status: 404 })
    } catch (e) {
      console.error(e)
      return Response.json({ success: false }, { status: 500 })
    }
  },
}
