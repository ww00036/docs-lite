import fs from "node:fs/promises";
import path from "node:path";

const docsDir = path.join(process.cwd(), "docs");

async function walkMarkdownFiles(dirPath) {
  const entries = await fs.readdir(dirPath, {withFileTypes: true});
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkMarkdownFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}

function normalizeToRelativeImgPath(rawPath, fileRelativeDir) {
  const clean = rawPath.trim().replace(/^\.\//, "");
  const imgPos = clean.indexOf("img/");
  if (imgPos === -1) {
    return rawPath;
  }

  const suffix = clean.slice(imgPos + 4);
  const fromDir = fileRelativeDir === "." ? "" : fileRelativeDir;
  const prefix = path.posix.relative(fromDir, "img");
  return `${prefix || "img"}/${suffix}`;
}

async function processFile(filePath) {
  const relative = path.relative(docsDir, filePath).replaceAll("\\", "/");
  const dir = path.posix.dirname(relative);
  const original = await fs.readFile(filePath, "utf8");
  let updated = original;

  updated = updated.replace(
    /\]\(((?:\.\/)?(?:\.\.\/)*img\/[^)]+)\)/g,
    (_, p1) => `](${normalizeToRelativeImgPath(p1, dir)})`,
  );
  updated = updated.replace(
    /src="((?:\.\/)?(?:\.\.\/)*img\/[^"]+)"/g,
    (_, p1) => `src="${normalizeToRelativeImgPath(p1, dir)}"`,
  );
  updated = updated.replace(
    /src='((?:\.\/)?(?:\.\.\/)*img\/[^']+)'/g,
    (_, p1) => `src='${normalizeToRelativeImgPath(p1, dir)}'`,
  );

  if (updated !== original) {
    await fs.writeFile(filePath, updated, "utf8");
    return true;
  }

  return false;
}

async function main() {
  const files = await walkMarkdownFiles(docsDir);
  let changed = 0;
  for (const file of files) {
    if (await processFile(file)) {
      changed += 1;
    }
  }
  console.log(`[normalize-image-paths] changed=${changed}, scanned=${files.length}`);
}

main().catch((error) => {
  console.error("[normalize-image-paths] failed:", error);
  process.exit(1);
});
