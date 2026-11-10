const usernames = Array.from(new Set(characters.map((u) => u.discoverer)))

// copy from ./userids.json
const userids = {}

const stop = { current: false }

const { stringify } = JSON

for (const username of usernames) {
  if (userids[username]) continue

  if (stop.current) break

  await new Promise((resolve) => setTimeout(resolve, 2000))

  const url = "https://www.reddit.com/user/" + username + "/about.json"
  const res = await fetch(url)

  if (!res.ok) {
    userids[username] = null
    console.log(stringify(username) + ": null")
    continue
  }

  const json = await res.json()
  userids[username] = json.data.id ?? null
  console.log(stringify(username) + ": " + stringify(userids[username]))
}
