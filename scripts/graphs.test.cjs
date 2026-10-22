const assert = require("node:assert/strict");
const {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
} = require("node:fs");
const { execFileSync } = require("node:child_process");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { test } = require("node:test");
const rest = require("@octokit/rest");
const OriginalOctokit = rest.Octokit;
const sharp = require("sharp");

// Replace only GitHub history retrieval; exercise the real chart and native
// canvas renderer without network access, credentials, or existing images.
rest.Octokit = class {
  constructor() {
    this.repos = {
      listCommits: async () => ({
        data: [123, 145].map((ms, index) => ({
          commit: {
            message: `Probe is up (200 in ${ms} ms)`,
            author: {
              date: new Date(Date.now() - index * 3600000).toISOString(),
            },
          },
        })),
      }),
    };
  }
};

test("renders each response-time graph on the supported Node runtime", async () => {
  const previous = process.cwd();
  const directory = mkdtempSync(join(tmpdir(), "coral-graphs-"));
  try {
    process.chdir(directory);
    writeFileSync(
      ".upptimerc.yml",
      "owner: synthetic\nrepo: synthetic\nsites:\n  - name: Probe\n    url: https://example.invalid\n",
    );
    await require("@upptime/graphs").generateGraphs();
    const images = readdirSync("graphs/probe").sort();
    assert.deepEqual(images, [
      "response-time-day.png",
      "response-time-month.png",
      "response-time-week.png",
      "response-time-year.png",
      "response-time.png",
    ]);
    for (const file of images) {
      const png = readFileSync(join("graphs/probe", file));
      assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
      assert.equal(png.readUInt32BE(16), 600);
      assert.equal(png.readUInt32BE(20), 400);
      const optimized = await sharp(png)
        .png({ compressionLevel: 9 })
        .toBuffer();
      assert.equal(optimized.readUInt32BE(16), 600);
      assert.equal(optimized.readUInt32BE(20), 400);
    }
  } finally {
    process.chdir(previous);
    rmSync(directory, { recursive: true, force: true });
  }
});

test("patched Octokit dependencies preserve the legacy history client", async () => {
  let requested = false;
  const client = new OriginalOctokit({
    request: {
      fetch: async (url) => {
        requested = true;
        assert.match(String(url), /repos\/synthetic\/synthetic\/commits/);
        return new Response(JSON.stringify([{ sha: "fixture" }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  });
  const result = await client.repos.listCommits({
    owner: "synthetic",
    repo: "synthetic",
    path: "history/probe.yml",
  });
  assert.equal(requested, true);
  assert.equal(result.data[0].sha, "fixture");
});


test("publishes generated graphs to a local remote with configured authorship", async () => {
  const previous = process.cwd();
  const previousRef = process.env.GITHUB_REF_NAME;
  const directory = mkdtempSync(join(tmpdir(), "coral-graph-publish-"));
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
  try {
    git("init", "--bare", join(directory, "remote.git"));
    git("init", "-b", "main", join(directory, "work"));
    process.chdir(join(directory, "work"));
    git("remote", "add", "origin", join(directory, "remote.git"));
    writeFileSync(".upptimerc.yml", [
      "owner: synthetic", "repo: synthetic", "sites:",
      "  - name: Probe", "    url: https://example.invalid",
      "commitMessages:", "  commitAuthorName: Fixture Bot",
      "  commitAuthorEmail: fixture@example.invalid", "  signoff: true",
      "  graphsUpdate: Render fixture graphs", "",
    ].join("\n"));
    git("add", ".upptimerc.yml");
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
      "commit", "-m", "Initialize fixture");
    process.env.GITHUB_REF_NAME = "main";
    await require("./update-graphs.cjs").main();
    assert.match(git("log", "-1", "--format=%an%n%B"),
      /Fixture Bot\nRender fixture graphs[\s\S]*Signed-off-by: Fixture Bot/);
    assert.equal(git("rev-parse", "HEAD").trim(),
      git("--git-dir", join(directory, "remote.git"), "rev-parse", "main").trim());
    assert.equal(git("status", "--porcelain").trim(), "");
    assert.ok(git("ls-tree", "-r", "--name-only", "HEAD").includes("graphs/probe/response-time.png"));
  } finally {
    process.chdir(previous);
    if (previousRef === undefined) delete process.env.GITHUB_REF_NAME;
    else process.env.GITHUB_REF_NAME = previousRef;
    rmSync(directory, { recursive: true, force: true });
  }
});
