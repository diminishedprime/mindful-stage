import { z } from "zod";
import manifest from "../../package.json" with { type: "json" };
import { type Defaults, type PaletteKey, SCOPES } from "../types";

const ManifestSchema = z.object({
  contributes: z.object({
    colors: z.array(
      z.object({
        id: z.string(),
        defaults: z.object({
          dark: z.string().min(1),
          light: z.string().min(1),
          highContrast: z.string().min(1),
          highContrastLight: z.string().min(1),
        }),
      }),
    ),
  }),
});

export function contributedDefaults(): Record<PaletteKey, Defaults> {
  const declared = new Map(
    ManifestSchema.parse(manifest).contributes.colors.map(
      ({ id, defaults }) => [id, defaults],
    ),
  );
  const defaults = {} as Record<PaletteKey, Defaults>;
  const missing: string[] = [];
  for (const key of Object.keys(SCOPES) as PaletteKey[]) {
    const found = declared.get(`mindfulStage.${key}`);
    if (found === undefined) {
      missing.push(`mindfulStage.${key}`);
    } else {
      defaults[key] = found;
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `package.json contributes.colors is missing ${missing.join(", ")}`,
    );
  }
  return defaults;
}
