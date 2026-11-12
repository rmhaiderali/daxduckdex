import jwt from "jsonwebtoken"
import { parse as htmlParse } from "node-html-parser"
import { parseCookie, stringifySetCookie } from "cookie"

import selectCharacters from "./utils/select-chars.js"
import insertUserAndDeleteCachedChars from "./utils/insert-user-and-delete-cached-chars.js"
import insertCharsAndDeleteCachedChars from "./utils/insert-chars-and-delete-cached-chars.js"

import insertKvSql from "./sql/insert-kv.sql"
import selectKvSql from "./sql/select-kv.sql"

async function getImageLinkFromCharacterName(characterName) {
  console.log("Finding image link for character: " + characterName)

  const response = await fetch(
    "https://duckduckgo.com/?q=" + encodeURIComponent(characterName),
  )

  if (!response.ok) {
    console.error(response.statusText)
    return null
  }

  if (!response.headers.get("content-type")?.includes("text/html")) {
    console.error("URL did not return HTML content")
    return null
  }

  const html = await response.text()
  const document = htmlParse(html)

  const logo =
    document
      .querySelector(".header__logo")
      ?.getAttribute("data-dynamic-logo") || null

  if (!logo) {
    console.error("No logo found")
    return null
  }

  return "https://duckduckgo.com" + logo
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url)
      const params = Object.fromEntries([...url.searchParams.entries()])

      const cookies = parseCookie(request.headers.get("cookie") || "")

      let user = null

      if (
        cookies.token &&
        ["/submit/character", "/auth/user"].includes(url.pathname)
      ) {
        try {
          const decoded = jwt.verify(cookies.token, env.JWT_SECRET, {
            algorithms: ["HS256"],
          })
          const userId = decoded.id

          const result = await env.DB.prepare(
            "SELECT id, name, provider FROM users WHERE id = ?",
          )
            .bind(userId)
            .first()

          if (result) user = result
        } catch (error) {
          return Response.json({ error: "Error while authenticating" })
        }
      }

      if (url.pathname === "/api/characters") {
        const result = await env.DB.prepare(selectKvSql)
          .bind("characters")
          .first()

        const charsFromDB = result?.value

        if (charsFromDB) {
          console.log("Serving cached characters")
          return new Response(charsFromDB, {
            headers: { "Content-Type": "application/json" },
          })
        }

        const characters = await selectCharacters(env)

        await env.DB.prepare(insertKvSql)
          .bind("characters", JSON.stringify(characters))
          .run()

        console.log("Serving fresh characters")

        return Response.json(characters)
      }

      if (url.pathname === "/submit/character") {
        if (!user)
          return Response.json({ error: "Not authenticated" }, { status: 401 })

        const json = await request.json()

        const characterName = json.characterName?.trim?.()

        if (!characterName)
          return Response.json(
            { error: "Character name is required" },
            { status: 400 },
          )

        if (characterName.length > 50)
          return Response.json(
            { error: "Character name too long" },
            { status: 400 },
          )

        const imageLink = await getImageLinkFromCharacterName(characterName)

        if (!imageLink)
          return Response.json(
            { error: "Character not found" },
            { status: 404 },
          )

        console.log("Character found: " + imageLink)

        const result = await env.DB.prepare(
          "SELECT name FROM characters WHERE url = ?",
        )
          .bind(imageLink)
          .first()

        const name = result?.name

        if (name)
          return Response.json(
            { error: "Character already exists with name: " + name },
            { status: 409 },
          )

        const [date, time] = new Date().toISOString().split(/T|\./)

        await insertCharsAndDeleteCachedChars(env, [
          {
            id: null,
            name: characterName,
            url: imageLink,
            discoverer_id: user.id,
            discoverer_provider: user.provider,
            discovered_date: date,
            created_at: date + " " + time,
            tags: [],
          },
        ])

        return Response.json({ success: true })
      }

      if (url.pathname === "/auth/user") {
        if (!user) return Response.json({ error: "Not authenticated" })

        return Response.json({ success: true, user })
      }

      if (url.pathname === "/auth/discord") {
        const client_id = env.DISCORD_CLIENT_ID
        const redirect_uri = env.BASE_URL + "/auth/callback"
        const state = crypto.randomUUID()

        const authUrl = new URL("https://discord.com/oauth2/authorize")
        authUrl.searchParams.set("scope", "identify")
        authUrl.searchParams.set("response_type", "code")
        authUrl.searchParams.set("client_id", client_id)
        authUrl.searchParams.set("redirect_uri", redirect_uri)
        authUrl.searchParams.set("state", state)

        const setOauthStateCookie = stringifySetCookie({
          name: "oauth_state",
          value: state,
          path: "/",
          maxAge: 600,
          secure: true,
          httpOnly: true,
          sameSite: "Lax",
        })

        const headers = new Headers()
        headers.set("Location", authUrl.toString())
        headers.append("Set-Cookie", setOauthStateCookie)

        return new Response(null, { status: 302, headers })
      }

      if (url.pathname === "/auth/callback") {
        const { code, state } = params

        if (!code || !state)
          return Response.json({ error: "Missing parameters" }, { status: 400 })

        if (state !== cookies.oauth_state)
          return Response.json({ error: "Invalid state" }, { status: 400 })

        const client_id = env.DISCORD_CLIENT_ID
        const client_secret = env.DISCORD_CLIENT_SECRET
        const redirect_uri = env.BASE_URL + "/auth/callback"

        const tokenUrl = new URL("https://discord.com/api/oauth2/token")

        const body = new URLSearchParams()
        body.set("code", code)
        body.set("client_id", client_id)
        body.set("redirect_uri", redirect_uri)
        body.set("client_secret", client_secret)
        body.set("grant_type", "authorization_code")

        const tokenRes = await fetch(tokenUrl, {
          body,
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        })

        if (!tokenRes.ok) return new Response(null, { status: 500 })

        const { access_token } = await tokenRes.json()

        if (!access_token) return Response.json(null, { status: 500 })

        const userRes = await fetch("https://discord.com/api/users/@me", {
          headers: { Authorization: "Bearer " + access_token },
        })

        if (!userRes.ok) return Response.json(null, { status: 500 })

        const { id, username } = await userRes.json()

        if (!id || !username) return Response.json(null, { status: 500 })

        await insertUserAndDeleteCachedChars(env, {
          id,
          name: username,
          provider: "discord",
        })

        const token = jwt.sign({ id }, env.JWT_SECRET, {
          expiresIn: "1d",
          algorithm: "HS256",
        })

        const setTokenCookie = stringifySetCookie({
          path: "/",
          name: "token",
          value: token,
          secure: true,
          httpOnly: true,
          sameSite: "Strict",
          maxAge: 60 * 60 * 24,
        })

        const clearOauthStateCookie = stringifySetCookie({
          name: "oauth_state",
          value: "",
          path: "/",
          maxAge: 0,
          secure: true,
          httpOnly: true,
          sameSite: "Lax",
        })

        const headers = new Headers()
        headers.set("Location", "/?returnTo=submit")
        headers.append("Set-Cookie", setTokenCookie)
        headers.append("Set-Cookie", clearOauthStateCookie)

        return Response.json(null, { headers, status: 302 })
      }

      if (url.pathname === "/auth/logout") {
        const headers = new Headers()

        for (const name of Object.keys(cookies)) {
          const clearCookie = stringifySetCookie({
            name,
            value: "",
            path: "/",
            maxAge: 0,
            secure: true,
            httpOnly: true,
            sameSite: "Strict",
          })
          headers.append("Set-Cookie", clearCookie)
        }

        return new Response(null, { headers, status: 200 })
      }

      return new Response("Not Found", { status: 404 })
    } catch (e) {
      console.error(e)
      return Response.json({ success: false }, { status: 500 })
    }
  },
}
