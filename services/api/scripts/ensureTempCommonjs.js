const fs = require("fs");
const os = require("os");
const path = require("path");

/**
 * Workaround for a Windows dev-environment gotcha:
 * if the parent folder of the Node temp directory has `"type": "module"`,
 * ts-node-dev writes its hook file as `.js` into the OS temp folder.
 * Node then interprets that hook file as ESM, where `require` is undefined.
 *
 * We force temp `.js` files to be CommonJS by dropping a tiny package.json
 * into the OS temp dir.
 */
function main() {
  try {
    const tempDir = os.tmpdir();
    const pkgPath = path.join(tempDir, "package.json");
    const desired = { type: "commonjs" };

    let current = null;
    try {
      current = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    } catch {
      current = null;
    }

    if (current && current.type === "commonjs") return;
    fs.writeFileSync(pkgPath, JSON.stringify(desired), { encoding: "utf8" });
  } catch {
    // Non-fatal; if this fails, ts-node-dev may crash with ESM/require issues.
  }
}

main();

