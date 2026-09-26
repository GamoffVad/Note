import { useEffect, useState } from "react";

/**
 * Маршруты в hash: работают без сервера, в офлайне и с кнопкой «Назад»
 * браузера и Android.
 */
export type Section = "notes" | "tasks" | "files" | "devices" | "trash" | "settings";

export interface Route {
  section: Section;
  noteId: string | null;
  tag: string | null;
}

const SECTIONS: Section[] = ["notes", "tasks", "files", "devices", "trash", "settings"];

export function parseRoute(hash: string): Route {
  const [path = "", query = ""] = hash.replace(/^#\/?/, "").split("?");
  const [first, second] = path.split("/");
  const section = SECTIONS.includes(first as Section) ? (first as Section) : "notes";
  const params = new URLSearchParams(query);
  return {
    section,
    noteId: section === "notes" && second ? decodeURIComponent(second) : null,
    tag: section === "notes" ? params.get("tag") : null,
  };
}

export function routeHref(route: Partial<Route> & { section: Section }): string {
  let path = `#/${route.section}`;
  if (route.section === "notes" && route.noteId) path += `/${encodeURIComponent(route.noteId)}`;
  if (route.section === "notes" && route.tag) path += `?tag=${encodeURIComponent(route.tag)}`;
  return path;
}

export function navigate(route: Partial<Route> & { section: Section }, options: { replace?: boolean } = {}): void {
  const href = routeHref(route);
  if (options.replace) history.replaceState(null, "", href);
  else history.pushState(null, "", href);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const update = () => setRoute(parseRoute(location.hash));
    window.addEventListener("hashchange", update);
    window.addEventListener("popstate", update);
    return () => {
      window.removeEventListener("hashchange", update);
      window.removeEventListener("popstate", update);
    };
  }, []);
  return route;
}
