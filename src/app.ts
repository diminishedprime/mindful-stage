import type * as vscode from "vscode";
import { inject, injectable } from "tsyringe";
import { Commands } from "./commands";
import {
  COMMAND_REGISTRY,
  COMMANDS,
  DECORATIONS,
  EVENTS,
  FILE_BADGES,
  FILE_DECORATIONS,
  GUTTERS,
  LOGGER,
} from "./di-tokens";
import { FileBadges } from "./display/file-badges";
import { Gutters } from "./display/gutters";
import { Logger } from "./logger";
import type {
  CommandRegistry,
  Decorations,
  Events,
  FileDecorations,
} from "./types";

@injectable()
export class App {
  constructor(
    @inject(COMMANDS) private readonly commands: Commands,
    @inject(COMMAND_REGISTRY) private readonly registry: CommandRegistry,
    @inject(DECORATIONS) private readonly decorations: Decorations,
    @inject(EVENTS) private readonly events: Events,
    @inject(LOGGER) private readonly logger: Logger,
    @inject(GUTTERS) _gutters: Gutters,
    @inject(FILE_DECORATIONS)
    private readonly fileDecorations: FileDecorations,
    @inject(FILE_BADGES) _fileBadges: FileBadges,
  ) {}

  start(context: vscode.ExtensionContext): void {
    this.commands.register();

    context.subscriptions.push(
      { dispose: () => this.registry.dispose() },
      { dispose: () => this.commands.dispose() },
      { dispose: () => this.decorations.dispose() },
      { dispose: () => this.fileDecorations.dispose() },
      { dispose: () => this.events.dispose() },
      { dispose: () => this.logger.dispose() },
    );
  }
}
