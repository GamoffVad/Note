// Страница скачивания: определяет систему и даёт ссылку на установщик из
// последнего подходящего релиза GitHub (репозиторий GamoffVad/Note).
const REPO = "GamoffVad/Note";
const RELEASES = `https://github.com/${REPO}/releases/latest`;

/** Вид установщика по имени файла из релиза. */
function kind(name) {
  const n = name.toLowerCase();
  if (n.endsWith("-setup.exe")) return { os: "windows", label: "Windows", order: 1 };
  if (n.endsWith(".msi")) return { os: "windows-msi", label: "Windows (MSI)", order: 2 };
  if (n.endsWith(".dmg") && n.includes("aarch64")) return { os: "mac-arm", label: "macOS (Apple M1–M4)", order: 3 };
  if (n.endsWith(".dmg")) return { os: "mac-intel", label: "macOS (Intel)", order: 4 };
  if (n.endsWith(".apk")) return { os: "android", label: "Android", order: 5 };
  if (n.endsWith(".appimage")) return { os: "linux", label: "Linux (AppImage)", order: 6 };
  if (n.endsWith(".deb")) return { os: "linux-deb", label: "Linux (Ubuntu, Debian)", order: 7 };
  if (n.endsWith(".rpm")) return { os: "linux-rpm", label: "Linux (Fedora)", order: 8 };
  return null;
}

function detectOs() {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "mac-arm";
  if (/Linux|X11/i.test(ua)) return "linux";
  return "unknown";
}

function el(tag, attrs, text) {
  const node = document.createElement(tag);
  Object.assign(node, attrs);
  if (text) node.textContent = text;
  return node;
}

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

async function main() {
  const primary = document.getElementById("primary");
  const list = document.getElementById("all");
  const toggle = document.getElementById("toggle-all");
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    list.hidden = !open;
  });

  // Выпуск может быть не для всех систем (например, только Windows и Android):
  // для каждой системы берём установщик из самого нового выпуска, где он есть.
  let assets = [];
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=20`, { headers: { accept: "application/vnd.github+json" } });
    if (!res.ok) throw new Error(String(res.status));
    const seen = new Set();
    for (const release of await res.json()) {
      if (release.draft || release.prerelease) continue;
      const version = (release.tag_name ?? "").replace(/^desktop-v/, "");
      for (const a of release.assets) {
        const k = kind(a.name);
        if (!k || seen.has(k.os)) continue;
        seen.add(k.os);
        assets.push({ ...a, kind: k, version });
      }
    }
    if (!assets.length) throw new Error("нет установщиков");
    assets.sort((a, b) => a.kind.order - b.kind.order);
  } catch {
    primary.replaceChildren(
      el("a", { className: "button", href: RELEASES }, "Скачать Маяк"),
      el("p", { className: "muted" }, "Выберите файл для своей системы на странице релиза."),
    );
    return;
  }

  for (const a of assets) {
    const link = el("a", { href: a.browser_download_url });
    link.append(el("span", {}, `${a.kind.label} · ${a.version}`), el("span", { className: "size" }, mb(a.size)));
    const item = el("li", {});
    item.append(link);
    list.append(item);
  }

  const os = detectOs();
  const main = assets.find((a) => a.kind.os === os);
  const nodes = [];
  if (os === "ios") {
    nodes.push(el("p", {}, "Версия для iPhone и iPad скоро появится."));
  } else if (main) {
    nodes.push(el("a", { className: "button", href: main.browser_download_url }, `Скачать для ${main.kind.label}`));
    if (os === "mac-arm") {
      const intel = assets.find((a) => a.kind.os === "mac-intel");
      if (intel) nodes.push(el("a", { className: "secondary-link", href: intel.browser_download_url }, "У меня Mac на Intel"));
    }
  } else {
    nodes.push(el("p", {}, "Выберите версию для своей системы:"));
    toggle.click();
  }
  if (main?.version) nodes.push(el("p", { className: "muted" }, `Версия ${main.version}`));
  primary.replaceChildren(...nodes);
}

main();
