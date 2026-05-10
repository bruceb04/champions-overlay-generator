const path = require("node:path");

const patchPath = path.resolve(__dirname, "patch-readlink.cjs");
const existingNodeOptions = process.env.NODE_OPTIONS || "";
process.env.NODE_OPTIONS = `${existingNodeOptions} --require=${patchPath}`.trim();
process.env.NEXT_DIST_DIR ||= process.argv.includes("build")
  ? `next-build-${Date.now()}`
  : "next-dev";

require(patchPath);

process.env.NEXT_PRIVATE_BUILD_WORKER = "0";

require("../node_modules/next/dist/bin/next");
