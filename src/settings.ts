import { App, PluginSettingTab, Setting, normalizePath } from "obsidian";
import MyPlugin from "./main";

export interface CardTagRule {
  cardName: string;
  tags: string[];
}

export interface PluginSettings {
  templateDirectory: string;
  cardTagRules: CardTagRule[];
}

export const DEFAULT_SETTINGS: PluginSettings = {
  templateDirectory: "templates",
  cardTagRules: [],
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

    new Setting(containerEl).setName("Canvas card tags").setHeading();
    containerEl.createEl("p", {
      text: "Define card names and the tags to apply when generating a template from a canvas.",
    });

    const rules = this.plugin.settings.cardTagRules;
    rules.forEach((rule, index) => {
      const ruleSetting = new Setting(containerEl)
        .setName(`Rule ${index + 1}`)
        .setDesc("Card name and tags to add")
        .addText((text) => {
          text.setPlaceholder("Card name");
          text.setValue(rule.cardName);
          text.onChange(async (value) => {
            rule.cardName = value;
            await this.plugin.saveSettings();
          });
        })
        .addText((text) => {
          text.setPlaceholder("tag1, tag2");
          text.setValue(rule.tags.join(", "));
          text.onChange(async (value) => {
            rule.tags = value
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
          });
        });

      ruleSetting.addButton((button) => {
        button.setButtonText("Remove");
        button.onClick(async () => {
          this.plugin.settings.cardTagRules.splice(index, 1);
          await this.plugin.saveSettings();
          this.display();
        });
      });
    });

    new Setting(containerEl)
      .setName("Add rule")
      .setDesc("Add a new card-name/tag rule")
      .addButton((button) => {
        button.setButtonText("Add");
        button.onClick(async () => {
          this.plugin.settings.cardTagRules.push({ cardName: "", tags: [] });
          await this.plugin.saveSettings();
          this.display();
        });
      });
  }
}
