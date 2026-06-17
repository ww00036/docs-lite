import {spawnSync} from "node:child_process";
import {cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import sharp from "sharp";

const LOCALES = ["ar", "de", "es", "fr", "it", "ja", "ko", "pt", "ru", "tr", "zh-Hans"];
const SUPPORTED_LANGS = ["en", ...LOCALES];
const ROOT_DIR = process.cwd();
const DOCS_DIR = path.join(ROOT_DIR, "docs");
const LATEX_ENGINES = new Set(["pdflatex", "lualatex", "xelatex", "latexmk", "tectonic"]);
const CIRCLED_NUMBER_REPLACEMENTS = [
  ["①", "1"],
  ["②", "2"],
  ["③", "3"],
  ["④", "4"],
  ["⑤", "5"],
  ["⑥", "6"],
  ["⑦", "7"],
  ["⑧", "8"],
  ["⑨", "9"],
  ["⑩", "10"],
  ["⑪", "11"],
  ["⑫", "12"],
  ["⑬", "13"],
  ["⑭", "14"],
  ["⑮", "15"],
];

function parseCliArgs(argv) {
  let lang;
  let engine;
  let positionalLang;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg.startsWith("--lang=")) {
      lang = arg.slice("--lang=".length);
      continue;
    }

    if (arg === "--lang") {
      lang = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--engine=")) {
      engine = arg.slice("--engine=".length);
      continue;
    }

    if (arg === "--engine") {
      engine = argv[index + 1];
      index += 1;
      continue;
    }

    if (!arg.startsWith("-") && positionalLang == null) {
      positionalLang = arg;
    }
  }

  return {lang: lang ?? positionalLang ?? "en", engine: engine ?? process.env.PANDOC_PDF_ENGINE ?? "xelatex"};
}

const {lang: selectedLang, engine: pdfEngine} = parseCliArgs(process.argv.slice(2));

if (!SUPPORTED_LANGS.includes(selectedLang)) {
  console.error(`[export-pdf] Unsupported language "${selectedLang}".`);
  console.error(`[export-pdf] Supported languages: ${SUPPORTED_LANGS.join(", ")}`);
  process.exit(1);
}

function assertCommandAvailable(command, installHint) {
  const checker = spawnSync(command, ["--version"], {encoding: "utf8", shell: true});
  if (checker.status === 0) {
    return;
  }

  console.error(`[export-pdf] Missing required command: ${command}`);
  if (installHint) {
    console.error(`[export-pdf] ${installHint}`);
  }
  process.exit(1);
}

assertCommandAvailable("pandoc", "Please install Pandoc: https://pandoc.org/installing.html");
if (pdfEngine === "xelatex") {
  assertCommandAvailable("xelatex", "Please install a TeX distribution (e.g. MiKTeX or TeX Live).");
}

function parseFrontmatterMeta(markdown) {
  if (!markdown.startsWith("---")) {
    return {};
  }

  const lines = markdown.split(/\r?\n/);
  let inFrontmatter = false;
  const meta = {};

  for (const line of lines) {
    if (line.trim() === "---") {
      if (!inFrontmatter) {
        inFrontmatter = true;
        continue;
      }
      break;
    }

    if (!inFrontmatter) {
      continue;
    }

    const match = line.match(/^([a-zA-Z0-9_]+):\s*(.+)\s*$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    const value = rawValue.replace(/^["']|["']$/g, "");
    meta[key] = value;
  }

  return meta;
}

async function parseCategoryMeta(dirPath) {
  const categoryPath = path.join(dirPath, "_category_.json");
  try {
    const raw = await readFile(categoryPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function collectMarkdownFiles(contentRoot, currentDir) {
  const entries = await readdir(currentDir, {withFileTypes: true});
  const folders = [];
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === ".vitepress" || entry.name === "public") {
      continue;
    }

    const fullPath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      folders.push({entry, fullPath});
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push({entry, fullPath});
    }
  }

  const indexFile = files.find(({entry}) => entry.name === "index.md")?.fullPath;
  const normalFiles = files.filter(({entry}) => entry.name !== "index.md");

  const sortedFiles = [];
  for (const file of normalFiles) {
    const content = await readFile(file.fullPath, "utf8");
    const meta = parseFrontmatterMeta(content);
    sortedFiles.push({
      fullPath: file.fullPath,
      name: file.entry.name,
      position: meta.sidebar_position ? Number(meta.sidebar_position) : null,
    });
  }

  sortedFiles.sort((a, b) => {
    if (a.position != null && b.position != null) {
      return a.position - b.position;
    }
    if (a.position != null) {
      return -1;
    }
    if (b.position != null) {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });

  const sortedFolders = [];
  for (const folder of folders) {
    const meta = await parseCategoryMeta(folder.fullPath);
    sortedFolders.push({
      fullPath: folder.fullPath,
      name: folder.entry.name,
      position: typeof meta.position === "number" ? meta.position : null,
    });
  }

  sortedFolders.sort((a, b) => {
    if (a.position != null && b.position != null) {
      return a.position - b.position;
    }
    if (a.position != null) {
      return -1;
    }
    if (b.position != null) {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });

  const result = [];
  if (indexFile) {
    result.push(indexFile);
  }

  for (const file of sortedFiles) {
    result.push(file.fullPath);
  }

  for (const folder of sortedFolders) {
    const nested = await collectMarkdownFiles(contentRoot, folder.fullPath);
    result.push(...nested);
  }

  return result;
}

function isExternalRef(refPath) {
  return /^(?:[a-z]+:)?\/\//i.test(refPath) || refPath.startsWith("data:") || refPath.startsWith("mailto:");
}

function normalizeRefForFileSystem(refPath) {
  const [withoutHash] = refPath.split("#", 1);
  const [withoutQuery] = withoutHash.split("?", 1);
  let decoded = withoutQuery;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    decoded = withoutQuery;
  }
  return decoded;
}

function normalizeUnicodeForPdf(content) {
  let normalized = content;
  for (const [from, to] of CIRCLED_NUMBER_REPLACEMENTS) {
    normalized = normalized.replaceAll(from, to);
  }
  // Remove emoji variation selector to avoid xelatex stderr encoding issues on Windows.
  normalized = normalized.replaceAll("\uFE0F", "");
  return normalized;
}

function getRefCandidates(refPath) {
  const trimmed = refPath.trim();
  const candidates = [];

  if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
    candidates.push(trimmed.slice(1, -1));
  }

  candidates.push(trimmed);

  const firstToken = trimmed.split(/\s+/)[0];
  if (firstToken && firstToken !== trimmed) {
    candidates.push(firstToken);
  }

  return [...new Set(candidates)];
}

function collectImageRefs(content) {
  const refs = new Set();
  const markdownPattern = /!\[[^\]]*]\(([^)\n]+)\)/g;
  const htmlPattern = /src=["']([^"']+)["']/g;

  let match;
  while ((match = markdownPattern.exec(content)) !== null) {
    const ref = match[1].trim();
    if (!ref || ref.startsWith("#") || ref.startsWith("/") || isExternalRef(ref)) {
      continue;
    }
    refs.add(ref);
  }
  while ((match = htmlPattern.exec(content)) !== null) {
    const ref = match[1].trim();
    if (!ref || ref.startsWith("#") || ref.startsWith("/") || isExternalRef(ref)) {
      continue;
    }
    refs.add(ref);
  }

  return [...refs];
}

async function materializeAsset(refPath, markdownFilePath, tempMediaDir, shouldConvertWebp, assetCache) {
  const markdownDir = path.dirname(markdownFilePath);
  const fallbackExts = [".webp", ".png", ".jpg", ".jpeg"];

  let resolvedSourcePath = null;
  let sourceStat = null;
  let cacheKey = null;

  for (const candidate of getRefCandidates(refPath)) {
    const normalizedRef = normalizeRefForFileSystem(candidate);
    const resolvedFromMarkdown = path.resolve(markdownDir, normalizedRef);
    const candidateCacheKey = resolvedFromMarkdown.toLowerCase();

    if (assetCache.has(candidateCacheKey)) {
      return assetCache.get(candidateCacheKey);
    }

    let currentResolvedPath = resolvedFromMarkdown;
    let currentStat = await stat(currentResolvedPath).catch(() => null);
    if (!currentStat || !currentStat.isFile()) {
      const parsedFallback = path.parse(currentResolvedPath);
      for (const ext of fallbackExts) {
        if (ext === parsedFallback.ext.toLowerCase()) {
          continue;
        }
        const candidatePath = path.join(parsedFallback.dir, `${parsedFallback.name}${ext}`);
        const candidateStat = await stat(candidatePath).catch(() => null);
        if (candidateStat && candidateStat.isFile()) {
          currentResolvedPath = candidatePath;
          currentStat = candidateStat;
          break;
        }
      }
    }

    if (currentStat && currentStat.isFile()) {
      resolvedSourcePath = currentResolvedPath;
      sourceStat = currentStat;
      cacheKey = candidateCacheKey;
      break;
    }
  }

  if (!resolvedSourcePath || !sourceStat || !sourceStat.isFile() || !cacheKey) {
    throw new Error(`Missing asset file (relative to "${path.relative(DOCS_DIR, markdownFilePath)}"): ${refPath}`);
  }

  let targetRelativePath = path.relative(DOCS_DIR, resolvedSourcePath);
  if (targetRelativePath.startsWith("..")) {
    targetRelativePath = path.basename(resolvedSourcePath);
  }

  const parsed = path.parse(targetRelativePath);
  const sourceExt = path.extname(resolvedSourcePath).toLowerCase();

  if (shouldConvertWebp && sourceExt === ".webp") {
    targetRelativePath = path.join(parsed.dir, `${parsed.name}.png`);
  }

  const targetPath = path.join(tempMediaDir, targetRelativePath);
  await mkdir(path.dirname(targetPath), {recursive: true});

  if (shouldConvertWebp && sourceExt === ".webp") {
    await sharp(resolvedSourcePath).png().toFile(targetPath);
  } else {
    await cp(resolvedSourcePath, targetPath, {force: true});
  }

  const targetRef = targetPath.replace(/\\/g, "/");
  assetCache.set(cacheKey, targetRef);
  return targetRef;
}

async function buildTempMarkdownFiles(sourceFiles, tempRoot, engine) {
  const tempDocsRoot = path.join(tempRoot, "docs");
  const tempMediaDir = path.join(tempRoot, "media");
  const shouldConvertWebp = LATEX_ENGINES.has(engine);
  const assetCache = new Map();

  await mkdir(tempDocsRoot, {recursive: true});
  await mkdir(tempMediaDir, {recursive: true});

  const rewrittenPaths = [];
  for (const filePath of sourceFiles) {
    const relative = path.relative(DOCS_DIR, filePath);
    const target = path.join(tempDocsRoot, relative);
    await mkdir(path.dirname(target), {recursive: true});
    const original = await readFile(filePath, "utf8");
    const refs = collectImageRefs(original);
    let rewritten = original;

    for (const ref of refs) {
      const resolved = await materializeAsset(ref, filePath, tempMediaDir, shouldConvertWebp, assetCache);
      rewritten = rewritten.replaceAll(`](${ref})`, `](${resolved})`);
      rewritten = rewritten.replaceAll(`src="${ref}"`, `src="${resolved}"`);
      rewritten = rewritten.replaceAll(`src='${ref}'`, `src='${resolved}'`);
    }

    rewritten = normalizeUnicodeForPdf(rewritten);

    if (LATEX_ENGINES.has(engine)) {
      rewritten = rewritten.replaceAll("\\", "\\\\");
    }

    await writeFile(target, rewritten, "utf8");
    rewrittenPaths.push(target);
  }

  return rewrittenPaths;
}

async function resolveSourceRoot(lang) {
  if (lang === "en") {
    return DOCS_DIR;
  }

  const langDir = path.join(DOCS_DIR, lang);
  const langStat = await stat(langDir).catch(() => null);
  if (!langStat || !langStat.isDirectory()) {
    console.error(`[export-pdf] Missing language directory: ${langDir}`);
    process.exit(1);
  }
  return langDir;
}

async function main() {
  const sourceRoot = await resolveSourceRoot(selectedLang);
  let sourceFiles = await collectMarkdownFiles(sourceRoot, sourceRoot);

  if (selectedLang === "en") {
    sourceFiles = sourceFiles.filter((filePath) => {
      const relative = path.relative(DOCS_DIR, filePath).replace(/\\/g, "/");
      return !LOCALES.some((locale) => relative.startsWith(`${locale}/`));
    });
  }

  if (sourceFiles.length === 0) {
    console.error(`[export-pdf] No markdown files found for language "${selectedLang}".`);
    process.exit(1);
  }

  const tempRoot = await mkdtemp(path.join(tmpdir(), "doclite-pandoc-"));
  try {
    const rewrittenFiles = await buildTempMarkdownFiles(sourceFiles, tempRoot, pdfEngine);
    const inlineImageFilter = path.join(ROOT_DIR, "scripts", "pandoc-inline-image.lua");
    const outDir = path.join(ROOT_DIR, "build", "pdf");
    await mkdir(outDir, {recursive: true});
    const outFile = path.join(outDir, `mipmap-lite-docs-${selectedLang}.pdf`);

    const args = [
      ...rewrittenFiles,
      "-o",
      outFile,
      "--from",
      "markdown+raw_html",
      "--toc",
      "--number-sections",
      "--lua-filter",
      inlineImageFilter,
      "--pdf-engine",
      pdfEngine,
      "-V",
      "title=MipMap Lite User Manual",
    ];

    if (selectedLang === "zh-Hans" && pdfEngine === "xelatex") {
      args.push("-V", "mainfont=Microsoft YaHei", "-V", "CJKmainfont=Microsoft YaHei");
    }

    const result = spawnSync("pandoc", args, {
      stdio: "pipe",
      encoding: "utf8",
      shell: false,
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }

    console.log(`[export-pdf] Exported: ${path.relative(ROOT_DIR, outFile)}`);
    console.log(`[export-pdf] Source pages: ${sourceFiles.length}`);
  } finally {
    await rm(tempRoot, {recursive: true, force: true});
  }
}

main().catch((error) => {
  console.error("[export-pdf] failed:", error);
  process.exit(1);
});
