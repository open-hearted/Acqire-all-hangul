const { execSync } = require("child_process");

function resolveCommitSha() {
  // ホスティング環境が提供する env を優先し、なければ git から取得する
  const fromEnv =
    process.env.NEXT_PUBLIC_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA;
  const sha =
    fromEnv ||
    (() => {
      try {
        return execSync("git rev-parse HEAD").toString().trim();
      } catch {
        return "";
      }
    })();
  return sha ? sha.slice(0, 7) : "unknown";
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_COMMIT_SHA: resolveCommitSha(),
  },
};

module.exports = nextConfig;
