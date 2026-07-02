import { App, PluginSettingTab, Setting, normalizePath } from "obsidian";
import MyPlugin from "./main";

export interface PluginSettings {
  templateDirectory: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  templateDirectory: "templates",
};

export class SettingTab extends PluginSettingTab {
  plugin: MyPlugin;

  constructor(app: App, plugin: MyPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName("Template directory")
      .setDesc("The directory to search for templates. Defaults to 'templates'")
      .addText((text) =>
        text
          .setPlaceholder("Path")
          .setValue(this.plugin.settings.templateDirectory)
          .onChange(async (value) => {
            this.plugin.settings.templateDirectory = normalizePath(value);
            await this.plugin.saveSettings();
          }),
      );
  }
}
