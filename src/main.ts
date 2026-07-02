import {
  App,
  DropdownComponent,
  Editor,
  MarkdownView,
  MarkdownFileInfo,
  Modal,
  Notice,
  Plugin,
  Setting,
  TFile,
  TFolder,
  TextComponent,
  normalizePath,
} from "obsidian";
import { DEFAULT_SETTINGS, PluginSettings, SettingTab } from "./settings";

export default class TemplateGen extends Plugin {
  settings!: PluginSettings;

  async onload() {
    await this.loadSettings();

    this.addRibbonIcon("dice", "Sample", (_evt: MouseEvent) => {
      new Notice("This is a notice!");
    });

    const statusBarItemEl = this.addStatusBarItem();
    statusBarItemEl.setText("Status bar text");

    this.addCommand({
      id: "open-modal-simple",
      name: "Open modal (simple)",
      callback: () => {
        new TemplateGenModal(this.app, this).open();
      },
    });

    this.addCommand({
      id: "replace-selected",
      name: "Replace selected content",
      editorCallback: (
        editor: Editor,
        _ctx: MarkdownView | MarkdownFileInfo,
      ) => {
        editor.replaceSelection("Sample editor command");
      },
    });

    this.addCommand({
      id: "open-modal-complex",
      name: "Open modal (complex)",
      checkCallback: (checking: boolean) => {
        const markdownView =
          this.app.workspace.getActiveViewOfType(MarkdownView);
        if (markdownView) {
          if (!checking) {
            new TemplateGenModal(this.app, this).open();
          }

          return true;
        }
        return false;
      },
    });

    this.addSettingTab(new SettingTab(this.app, this));

    this.registerDomEvent(activeDocument, "click", (_evt: MouseEvent) => {
      new Notice("Click");
    });
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      (await this.loadData()) as Partial<PluginSettings>,
    );
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class TemplateGenModal extends Modal {
  private plugin: TemplateGen;
  private templates: TFile[] = [];
  private selectedTemplate: TFile | null = null;
  private nameInput: TextComponent | null = null;
  private destinationInput: TextComponent | null = null;
  private suffixLabel: HTMLSpanElement | null = null;
  private generateButton: HTMLButtonElement | null = null;

  constructor(app: App, plugin: TemplateGen) {
    super(app);
    this.plugin = plugin;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("template-gen-modal");
    contentEl.createEl("h2", { text: "Generate template" });

    const directoryPath = normalizePath(
      this.plugin.settings.templateDirectory || "templates",
    );
    const directory = this.app.vault.getAbstractFileByPath(directoryPath);

    if (!directory || !(directory instanceof TFolder)) {
      contentEl.createEl("p", {
        text: `No template directory was found at "${directoryPath}".`,
      });
      return;
    }

    this.templates = directory.children
      .filter((child): child is TFile => child instanceof TFile)
      .sort((a, b) => a.name.localeCompare(b.name));

    if (this.templates.length === 0) {
      contentEl.createEl("p", {
        text: `No templates were found in "${directoryPath}".`,
      });
      return;
    }

    this.selectedTemplate = this.templates[0] ?? null;

    new Setting(contentEl)
      .setName("Template")
      .setDesc("Choose a template from the configured template directory")
      .addDropdown((dropdown: DropdownComponent) => {
        this.templates.forEach((template) => {
          dropdown.addOption(template.path, template.name);
        });
        if (this.selectedTemplate) {
          dropdown.setValue(this.selectedTemplate.path);
        }
        dropdown.onChange((value) => {
          this.selectedTemplate =
            this.templates.find((template) => template.path === value) ?? null;
          this.updateNamePreview();
        });
      });

    new Setting(contentEl)
      .setName("New template name")
      .setDesc("Enter the new name without changing the file type")
      .addText((text) => {
        this.nameInput = text;
        text.setPlaceholder("my-template");
        text.inputEl.addClass("template-gen-name-input");
        text.onChange(() => this.updateNamePreview());
      })
      .controlEl.createDiv({ cls: "template-gen-suffix" });

    const suffixWrapper = contentEl.querySelector(
      ".template-gen-suffix",
    ) as HTMLDivElement | null;
    if (suffixWrapper) {
      suffixWrapper.createEl("span", { text: "File type:" });
      this.suffixLabel = suffixWrapper.createEl("span", { text: "" });
    }

    new Setting(contentEl)
      .setName("Destination path")
      .setDesc("Relative path where the new template should be created")
      .addText((text) => {
        this.destinationInput = text;
        text.setPlaceholder("templates/created");
        text.setValue("templates");
      });

    const buttonRow = contentEl.createDiv({ cls: "modal-button-container" });
    this.generateButton = buttonRow.createEl("button", {
      text: "Generate",
      cls: "mod-cta",
    });
    this.generateButton.disabled = true;

    this.generateButton.addEventListener("click", () => {
      void this.handleGenerate();
    });

    this.updateNamePreview();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }

  private updateNamePreview() {
    if (!this.selectedTemplate) {
      return;
    }

    const suffix = this.getTemplateSuffix(this.selectedTemplate);
    if (this.suffixLabel) {
      this.suffixLabel.textContent = suffix;
    }

    const nameValue = this.nameInput?.getValue().trim() ?? "";
    if (this.generateButton) {
      this.generateButton.disabled = nameValue.length === 0;
    }
  }

  private getTemplateSuffix(template: TFile): string {
    const lastDotIndex = template.name.lastIndexOf(".");
    if (lastDotIndex > 0) {
      return template.name.slice(lastDotIndex);
    }
    return "";
  }

  private async handleGenerate() {
    if (!this.selectedTemplate) {
      new Notice("Select a template first.");
      return;
    }

    const nameInput = this.nameInput?.getValue().trim() ?? "";
    const destinationInput = this.destinationInput?.getValue().trim() ?? "";

    if (!nameInput) {
      new Notice("Enter a new template name.");
      return;
    }

    if (!destinationInput) {
      new Notice("Enter a destination path.");
      return;
    }

    const safeName = nameInput
      .replace(/\.[^./\\]+$/, "")
      .replace(/[\\/]/g, "")
      .trim();

    if (!safeName) {
      new Notice("Enter a valid template name.");
      return;
    }

    const suffix = this.getTemplateSuffix(this.selectedTemplate);
    const normalizedDestination = normalizePath(destinationInput);
    const destinationFileName = `${safeName}${suffix}`;
    const isFileLikePath =
      normalizedDestination.split("/").pop()?.includes(".") ?? false;
    const targetPath = isFileLikePath
      ? normalizedDestination
      : `${normalizedDestination}/${destinationFileName}`;

    if (this.app.vault.getAbstractFileByPath(targetPath)) {
      new Notice("A file already exists at that path.");
      return;
    }

    const parentPath = this.getParentPath(targetPath);
    if (parentPath) {
      await this.ensureFolder(parentPath);
    }

    await this.app.vault.copy(this.selectedTemplate, targetPath);
    new Notice(`Template copied to ${targetPath}`);
    this.close();
  }

  private getParentPath(targetPath: string): string {
    const segments = targetPath.split("/").filter(Boolean);
    if (segments.length <= 1) {
      return "";
    }

    return segments.slice(0, -1).join("/");
  }

  private async ensureFolder(folderPath: string): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(folderPath);
    if (existing) {
      return;
    }

    const parentPath = this.getParentPath(folderPath);
    if (parentPath) {
      await this.ensureFolder(parentPath);
    }

    await this.app.vault.createFolder(folderPath);
  }
}
