import "server-only";
import { db, type Db } from "@/lib/database/pool";
import { audit } from "@/lib/audit";
import { parseSetting, settingSchemas, SETTING_KEYS, type SettingKey, type Settings } from "../domain/schemas";

/** Uncached read of all settings (safe in workers/tests). */
export async function loadSettings(executor: Db = db): Promise<Settings> {
  const rows = await executor.query<{ key: string; value: unknown }>("select key, value from settings");
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const out = {} as Record<SettingKey, unknown>;
  for (const key of SETTING_KEYS) out[key] = parseSetting(key, map.get(key));
  return out as Settings;
}

export async function loadSetting<K extends SettingKey>(key: K, executor: Db = db): Promise<Settings[K]> {
  const row = await executor.one<{ value: unknown }>("select value from settings where key = $1", [key]);
  return parseSetting(key, row?.value);
}

export async function saveSetting<K extends SettingKey>(key: K, value: unknown, actorId: string): Promise<Settings[K]> {
  const parsed = settingSchemas[key].parse(value) as Settings[K];
  await db.query(
    `insert into settings (key, value, updated_by) values ($1, $2, $3)
     on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by`,
    [key, JSON.stringify(parsed), actorId],
  );
  await audit({ actorId, action: "settings.update", entityType: "settings", entityId: key });
  return parsed;
}
