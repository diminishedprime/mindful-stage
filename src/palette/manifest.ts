import { inject, injectable } from "tsyringe";
import { PACKAGE_JSON } from "../di-tokens";
import { type Defaults, ManifestSchema } from "../types";

@injectable()
export class Manifest {
  private readonly declared: Map<string, Defaults>;

  constructor(@inject(PACKAGE_JSON) packageJSON: unknown) {
    const { contributes } = ManifestSchema.parse(packageJSON);
    this.declared = new Map(
      contributes.colors.map(({ id, defaults }) => [id, defaults]),
    );
  }

  defaultsFor(id: string): Defaults | undefined {
    return this.declared.get(id);
  }
}
