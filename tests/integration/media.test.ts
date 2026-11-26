import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { db, closePool } from "@/lib/database/pool";
import { cropMedia, cropRect, setFocalPoint, storageUsage, uploadMedia } from "@/features/media/application/media";
import { storage } from "@/lib/storage";

afterAll(() => closePool());
let actor: string;
beforeAll(async () => {
  actor = (await db.one<{ id: string }>("insert into users (email, role) values ('media@example.com','owner') on conflict (email) do update set role='owner' returning id"))!.id;
});

describe("media focal point, cropping and usage", () => {
  it("computes crop rectangles that keep the focal point in frame", () => {
    expect(cropRect(2000, 1000, 1, 0.9, 0.5)).toEqual({ left: 1000, top: 0, width: 1000, height: 1000 });
    expect(cropRect(2000, 1000, 1, 0.5, 0.5)).toEqual({ left: 500, top: 0, width: 1000, height: 1000 });
    expect(cropRect(1000, 2000, 16 / 9, 0.5, 0.0)).toEqual({ left: 0, top: 0, width: 1000, height: 563 });
  });

  it("strips metadata on upload, creates a cropped copy and reports storage used", async () => {
    // A real JPEG with EXIF metadata; the focal subject (red block) sits on the right.
    const img = await sharp({ create: { width: 1600, height: 800, channels: 3, background: "#ffffff" } })
      .composite([{ input: { create: { width: 200, height: 200, channels: 3, background: "#ff0000" } }, left: 1300, top: 300 }])
      .withMetadata({ exif: { IFD0: { Copyright: "Test", ImageDescription: "gps-should-be-stripped" } } })
      .jpeg().toBuffer();
    const { asset } = await uploadMedia({ bytes: img, filename: "Hero Photo.jpg", visibility: "public", altText: "Hero", actorId: actor });
    expect(asset.mime_type).toBe("image/webp");
    const stored = await (await storage()).get(asset.storage_key, "public");
    expect((await sharp(stored!).metadata()).exif).toBeUndefined();
    expect(asset.variants.map((v) => v.width)).toEqual([480, 960]);

    await setFocalPoint(asset.id, 0.875, 0.5, actor);
    const crop = await cropMedia(asset.id, "1:1", actor);
    expect([crop.width, crop.height]).toEqual([800, 800]);
    const derived = await db.one<{ derived_from: string }>("select derived_from from media_assets where id = $1", [crop.id]);
    expect(derived!.derived_from).toBe(asset.id);
    // The red subject must be inside the square crop (right side of the source).
    const px = await sharp((await (await storage()).get(crop.storage_key, "public"))!).extract({ left: 600, top: 350, width: 1, height: 1 }).raw().toBuffer();
    expect(px[0]).toBeGreaterThan(200);
    expect(px[1]).toBeLessThan(60);

    const u = await storageUsage();
    expect(u.files).toBeGreaterThanOrEqual(2);
    expect(u.public_bytes).toBeGreaterThan(0);
  });
});
