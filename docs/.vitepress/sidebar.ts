import {readFileSync, readdirSync, existsSync} from "node:fs";
import path from "node:path";
import type {DefaultTheme} from "vitepress";

type CategoryMeta = {
  label?: string;
  position?: number;
  collapsed?: boolean;
};

type FrontmatterMeta = {
  title?: string;
  sidebar_position?: number;
  ignore?: boolean;
};

type SidebarNode = {
  text: string;
  position?: number;
  collapsed?: boolean;
  link?: string;
  items?: SidebarNode[];
};

type BuildSidebarOptions = {
  ignoredTopLevelDirs?: string[];
};

function parseCategoryMeta(dirPath: string): CategoryMeta {
  const categoryPath = path.join(dirPath, "_category_.json");
  if (!existsSync(categoryPath)) {
    return {};
  }

  try {
    const content = readFileSync(categoryPath, "utf8");
    return JSON.parse(content) as CategoryMeta;
  } catch {
    return {};
  }
}

function parseFrontmatterValue(value: string): string {
  return value.replace(/^["']|["']$/g, "").replace(/,\s*$/, "").trim();
}

function parseBooleanFrontmatterValue(value: string): boolean {
  return parseFrontmatterValue(value).toLowerCase() === "true";
}

function parseFrontmatter(filePath: string): FrontmatterMeta {
  const raw = readFileSync(filePath, "utf8");
  const content = raw.replace(/^\uFEFF/, "").trimStart();
  if (!content.startsWith("---")) {
    return {};
  }

  const lines = content.split(/\r?\n/);
  const meta: FrontmatterMeta = {};
  let inFrontmatter = false;

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

    const match = line.match(/^([a-zA-Z0-9_]+)\s*:\s*(.+)\s*$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    const value = parseFrontmatterValue(rawValue);

    if (key === "title") {
      meta.title = value;
      continue;
    }

    if (key === "sidebar_position") {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
        meta.sidebar_position = parsed;
      }
      continue;
    }

    if (key === "ignore") {
      meta.ignore = parseBooleanFrontmatterValue(rawValue);
    }
  }

  return meta;
}

function normalizeText(name: string): string {
  return name.replace(/\.md$/, "");
}

function sortNodes(a: SidebarNode, b: SidebarNode): number {
  if (a.position != null && b.position != null) {
    return a.position - b.position;
  }
  if (a.position != null) {
    return -1;
  }
  if (b.position != null) {
    return 1;
  }
  return a.text.localeCompare(b.text);
}

function toRoutePath(routePrefix: string, relativePath: string): string {
  const normalizedRelative = relativePath.replace(/\\/g, "/").replace(/\.md$/, "");
  if (normalizedRelative === "index") {
    return routePrefix;
  }
  return `${routePrefix}${normalizedRelative}`;
}

function collectNodes(
  contentRoot: string,
  currentDir: string,
  routePrefix: string,
  options: BuildSidebarOptions,
): SidebarNode[] {
  const entries = readdirSync(currentDir, {withFileTypes: true});
  const nodes: SidebarNode[] = [];
  const isTopLevel = path.resolve(currentDir) === path.resolve(contentRoot);
  const ignoredTopLevelDirSet = new Set(options.ignoredTopLevelDirs ?? []);

  for (const entry of entries) {
    if (entry.name === ".vitepress" || entry.name === "public" || entry.name.startsWith(".")) {
      continue;
    }

    const fullPath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      if (isTopLevel && ignoredTopLevelDirSet.has(entry.name)) {
        continue;
      }

      const meta = parseCategoryMeta(fullPath);
      const items = collectNodes(contentRoot, fullPath, routePrefix, options);
      if (items.length === 0) {
        continue;
      }

      nodes.push({
        text: meta.label ?? entry.name,
        position: meta.position,
        collapsed: meta.collapsed ?? false,
        items,
      });
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }

    const relativePath = path.relative(contentRoot, fullPath);
    if (relativePath.endsWith("/index.md") || relativePath.endsWith("\\index.md")) {
      continue;
    }

    const frontmatter = parseFrontmatter(fullPath);
    if (frontmatter.ignore) {
      continue;
    }

    nodes.push({
      text: frontmatter.title ?? normalizeText(entry.name),
      position: frontmatter.sidebar_position,
      link: toRoutePath(routePrefix, relativePath),
    });
  }

  return nodes.sort(sortNodes);
}

function toThemeSidebar(nodes: SidebarNode[]): DefaultTheme.SidebarItem[] {
  return nodes.map((node) => {
    if (node.items) {
      return {
        text: node.text,
        collapsed: node.collapsed ?? false,
        items: toThemeSidebar(node.items),
      } satisfies DefaultTheme.SidebarItem;
    }

    return {
      text: node.text,
      link: node.link,
    } satisfies DefaultTheme.SidebarItem;
  });
}

export function buildSidebar(contentRoot: string, routePrefix: string): DefaultTheme.SidebarItem[] {
  return buildSidebarWithOptions(contentRoot, routePrefix, {});
}

export function buildSidebarWithOptions(
  contentRoot: string,
  routePrefix: string,
  options: BuildSidebarOptions,
): DefaultTheme.SidebarItem[] {
  if (!existsSync(contentRoot)) {
    return [];
  }

  const normalizedPrefix = routePrefix.endsWith("/") ? routePrefix : `${routePrefix}/`;
  return toThemeSidebar(collectNodes(contentRoot, contentRoot, normalizedPrefix, options));
}
