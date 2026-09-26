import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { IndexedDbLocalStore, LocalWriteError, MemoryBacking, MemoryLocalStore, type LocalStore } from "../src/index.ts";

const implementations: Array<[string, () => Promise<LocalStore>]> = [
  ["память", async () => new MemoryLocalStore()],
  ["IndexedDB", async () => IndexedDbLocalStore.open(`test-${crypto.randomUUID()}`)],
];

describe.each(implementations)("LocalStore: %s", (_name, open) => {
  it("фиксирует все записи транзакции", async () => {
    const store = await open();
    await store.write(async (tx) => {
      await tx.put("notes", "a", { v: 1 });
      await tx.put("outbox", "a", { m: 1 });
    });
    const result = await store.read(async (tx) => [await tx.get("notes", "a"), await tx.get("outbox", "a")]);
    expect(result).toEqual([{ v: 1 }, { m: 1 }]);
  });

  it("не фиксирует ничего, если транзакция упала", async () => {
    const store = await open();
    await store.write((tx) => tx.put("notes", "a", { v: 1 }));
    await expect(
      store.write(async (tx) => {
        await tx.put("notes", "a", { v: 2 });
        await tx.put("outbox", "a", { m: 2 });
        throw new Error("сбой посреди записи");
      }),
    ).rejects.toThrow("сбой посреди записи");
    const result = await store.read(async (tx) => [await tx.get("notes", "a"), await tx.get("outbox", "a")]);
    expect(result).toEqual([{ v: 1 }, undefined]);
  });

  it("видит свои записи внутри транзакции; getAll учитывает удаление и clear", async () => {
    const store = await open();
    await store.write(async (tx) => {
      await tx.put("notes", "b", 2);
      await tx.put("notes", "a", 1);
    });
    const inside = await store.write(async (tx) => {
      await tx.delete("notes", "a");
      await tx.put("notes", "c", 3);
      const all = await tx.getAll<number>("notes");
      await tx.clear("notes");
      await tx.put("notes", "d", 4);
      return [all, await tx.getAll<number>("notes")];
    });
    expect(inside).toEqual([[2, 3], [4]]);
    expect(await store.read((tx) => tx.getAll("notes"))).toEqual([4]);
  });

  it("возвращает копии, а не ссылки на сохранённые объекты", async () => {
    const store = await open();
    const value = { list: [1] };
    await store.write((tx) => tx.put("notes", "a", value));
    value.list.push(2);
    const read = await store.read((tx) => tx.get<{ list: number[] }>("notes", "a"));
    expect(read).toEqual({ list: [1] });
  });
});

describe("MemoryLocalStore: имитация аварий", () => {
  it("после «падения процесса» видны только зафиксированные транзакции", async () => {
    const backing = new MemoryBacking();
    const store = new MemoryLocalStore(backing);
    await store.write((tx) => tx.put("notes", "saved", 1));
    let release!: () => void;
    const blocked = new Promise<void>((r) => (release = r));
    const pending = store.write(async (tx) => {
      await tx.put("notes", "lost", 2);
      await blocked;
    });
    store.close(); // процесс «убит» до commit
    release();
    await expect(pending).rejects.toBeInstanceOf(LocalWriteError);
    const reopened = new MemoryLocalStore(backing);
    expect(await reopened.read((tx) => tx.getAll("notes"))).toEqual([1]);
  });

  it("ошибка диска при commit не меняет данные", async () => {
    const backing = new MemoryBacking();
    const store = new MemoryLocalStore(backing);
    backing.failNextCommit = true;
    await expect(store.write((tx) => tx.put("notes", "a", 1))).rejects.toBeInstanceOf(LocalWriteError);
    expect(await store.read((tx) => tx.get("notes", "a"))).toBeUndefined();
  });
});
