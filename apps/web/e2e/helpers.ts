import { expect, type Page } from "@playwright/test";

/** Создаёт заметку и ждёт, пока откроется именно она (фокус в пустом заголовке). */
export async function createNote(page: Page, title: string, text?: string): Promise<string> {
  const before = page.url();
  await page.getByRole("button", { name: "Создать заметку" }).first().click();
  await page.waitForURL((u) => u.href !== before && /#\/notes\/[0-9a-f-]{36}$/.test(u.href));
  const titleField = page.getByLabel("Заголовок заметки");
  await expect(titleField).toBeFocused();
  await expect(titleField).toHaveValue("");
  await titleField.fill(title);
  if (text !== undefined) await page.getByLabel("Текст заметки").first().fill(text);
  await expect(page.locator(".save-state")).toHaveText(/Сохранено/);
  return page.url().split("/").pop()!;
}

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const widest = [...document.querySelectorAll("body *")]
      .map((el) => ({ el, right: el.getBoundingClientRect().right }))
      .filter((x) => x.right > window.innerWidth + 1 && getComputedStyle(x.el).visibility !== "hidden")
      .map((x) => `${x.el.tagName.toLowerCase()}.${String((x.el as HTMLElement).className)}`);
    return { scroll: document.documentElement.scrollWidth - window.innerWidth, widest: widest.slice(0, 5) };
  });
  expect(overflow).toEqual({ scroll: 0, widest: [] });
}
