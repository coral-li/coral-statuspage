const { generateGraphs } = require("@upptime/graphs");
const { readdir, readFile, writeFile, rm } = require("node:fs/promises");
const { execFileSync } = require("node:child_process");
const { join } = require("node:path");
const sharp = require("sharp");
const { load } = require("js-yaml");

async function optimize(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await optimize(path);
    else if (entry.name.endsWith(".png")) {
      const png = await sharp(await readFile(path))
        .png({ compressionLevel: 9 })
        .toBuffer();
      await writeFile(path, png);
    }
  }
}

async function main() {
  await generateGraphs();
  await optimize("graphs");
  // Keep per-site charts, matching the upstream graph publishing command.
  for (const suffix of ["", "-day", "-week", "-month", "-year"]) {
    await rm(`graphs/response-time${suffix}.png`, { force: true });
  }
  const config = load(await readFile(".upptimerc.yml", "utf8"));
  const messages = config.commitMessages || {};
  execFileSync("git", ["add", "--", "graphs", "api"]);
  if (
    !execFileSync("git", ["diff", "--cached", "--name-only"], {
      encoding: "utf8",
    }).trim()
  )
    return;
  execFileSync(
    "git",
    [
      "-c",
      `user.name=${messages.commitAuthorName || "Upptime Bot"}`,
      "-c",
      `user.email=${messages.commitAuthorEmail || "73812536+upptime-bot@users.noreply.github.com"}`,
      "commit",
      ...(messages.signoff ? ["--signoff"] : []),
      "-m",
      messages.graphsUpdate || ":bento: Update graphs [skip ci]",
    ],
    { stdio: "inherit" },
  );
  if (!process.env.GITHUB_REF_NAME)
    throw new Error("GITHUB_REF_NAME is required for publishing");
  execFileSync(
    "git",
    ["push", "origin", `HEAD:${process.env.GITHUB_REF_NAME}`],
    { stdio: "inherit" },
  );
}

module.exports = { main };

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
