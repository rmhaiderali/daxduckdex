import fs from "fs"

const overwrite = false
const holidayLogosPath = process.argv[2]

if (!fs.existsSync(holidayLogosPath)) {
  console.error("[ARG1] File not found: " + holidayLogosPath)
  process.exit(1)
}

if (!fs.existsSync("logos_archives")) {
  fs.mkdirSync("logos_archives")
}

const holidayLogos = JSON.parse(fs.readFileSync(holidayLogosPath, "utf8"))

for (const logo of holidayLogos) {
  const path = logo.local_image_path

  if (!overwrite && fs.existsSync(path)) {
    console.log("Already exists: " + path)
    continue
  }

  const url = "https://makdulac.com/" + path

  const res = await fetch(url)

  const bytes = await res.bytes()

  fs.writeFileSync(path, bytes)

  console.log("Downloaded: " + path)
}
