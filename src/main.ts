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

    this.addRibbonIcon("copy", "Generate from template", (_evt: MouseEvent) => {
      new TemplateGenModal(this.app, this).open();
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
  private canvasTagSection: HTMLDivElement | null = null;
  private cardTagInputs: Array<{ cardName: string; input: TextComponent }> = [];

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
          void this.renderCanvasTagSection();
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

    this.canvasTagSection = contentEl.createDiv({
      cls: "template-gen-card-tags",
    });
    await this.renderCanvasTagSection();

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

    const copiedFile = await this.app.vault.copy(
      this.selectedTemplate,
      targetPath,
    );
    await this.applyCardTags(copiedFile);
    new Notice(`Template copied to ${targetPath}`);
    this.close();
  }

  private async renderCanvasTagSection() {
    if (!this.canvasTagSection) {
      return;
    }

    this.canvasTagSection.empty();
    this.cardTagInputs = [];

    if (
      !this.selectedTemplate ||
      this.selectedTemplate.extension !== "canvas"
    ) {
      return;
    }

    const matchingRules = this.plugin.settings.cardTagRules.filter(
      (rule) => rule.cardName.trim().length > 0,
    );

    if (matchingRules.length === 0) {
      this.canvasTagSection.createEl("p", {
        text: "Add card-name rules in Settings to enable canvas card tagging.",
      });
      return;
    }

    const canvasData = await this.readCanvasData(this.selectedTemplate);
    if (!canvasData) {
      this.canvasTagSection.createEl("p", {
        text: "Unable to read canvas data for this template.",
      });
      return;
    }

    const matchedRules = matchingRules.filter((rule) =>
      this.findMatchingCanvasCard(canvasData, rule.cardName),
    );

    if (matchedRules.length === 0) {
      this.canvasTagSection.createEl("p", {
        text: "No configured card names were found in this canvas template.",
      });
      return;
    }

    this.canvasTagSection.createEl("h3", { text: "Canvas card tags" });

    matchedRules.forEach((rule) => {
      new Setting(this.canvasTagSection!)
        .setName(`Tags for "${rule.cardName}"`)
        .setDesc("Enter tags as a comma-separated list")
        .addText((text) => {
          text.setPlaceholder("tag1, tag2");
          text.setValue(rule.tags.join(", "));
          this.cardTagInputs.push({ cardName: rule.cardName, input: text });
        });
    });
  }

  private async readCanvasData(
    file: TFile,
  ): Promise<Record<string, any> | null> {
    try {
      const content = await this.app.vault.cachedRead(file);
      return JSON.parse(content) as Record<string, any>;
    } catch (error) {
      console.error("Failed to read canvas data", error);
      return null;
    }
  }

  private findMatchingCanvasCard(
    canvasData: Record<string, any>,
    cardName: string,
  ): boolean {
    const normalizedCardName = cardName.trim().toLowerCase();
    const nodes = Array.isArray(canvasData.nodes) ? canvasData.nodes : [];

    return nodes.some((node) => {
      const candidateNames = this.getCanvasNodeNames(node);
      return candidateNames.some(
        (candidate) => candidate.toLowerCase() === normalizedCardName,
      );
    });
  }

  private getCanvasNodeNames(node: Record<string, any>): string[] {
    const names = new Set<string>();
    const text = typeof node?.text === "string" ? node.text.trim() : "";

    if (text) {
      names.add(text);

      const headingMatch = text.match(/^#{1,6}\s*(.+)$/m);
      if (headingMatch?.[1]) {
        names.add(headingMatch[1].trim());
      }
    }

    if (typeof node?.label === "string" && node.label.trim()) {
      names.add(node.label.trim());
    }

    if (typeof node?.file === "string" && node.file.trim()) {
      const fileName = node.file.split("/").pop() ?? node.file;
      const withoutExtension = fileName.includes(".")
        ? fileName.substring(0, fileName.lastIndexOf("."))
        : fileName;
      if (withoutExtension) {
        names.add(withoutExtension);
      }
    }

    return Array.from(names);
  }

  private async applyCardTags(file: TFile): Promise<void> {
    if (file.extension !== "canvas") {
      return;
    }

    const canvasData = await this.readCanvasData(file);
    if (!canvasData) {
      return;
    }

    const nodes = Array.isArray(canvasData.nodes) ? canvasData.nodes : [];
    let changed = false;

    for (const entry of this.cardTagInputs) {
      const tags = entry.input
        .getValue()
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      if (tags.length === 0) {
        continue;
      }

      for (const node of nodes) {
        const candidateNames = this.getCanvasNodeNames(node);
        const isMatch = candidateNames.some(
          (candidate) =>
            candidate.toLowerCase() === entry.cardName.trim().toLowerCase(),
        );

        if (!isMatch) {
          continue;
        }

        const updatedText = this.appendTagsToNodeText(node, tags);
        if (updatedText !== node.text) {
          node.text = updatedText;
          changed = true;
        }
      }
    }

    if (changed) {
      await this.app.vault.modify(file, JSON.stringify(canvasData, null, 2));
    }
  }

  private appendTagsToNodeText(
    node: Record<string, any>,
    tags: string[],
  ): string {
    const tagLines = Array.from(new Set(tags))
      .map((tag) => `#${tag}`)
      .join("\n");

    const currentText = typeof node?.text === "string" ? node.text : "";
    if (!tagLines) {
      return currentText;
    }

    const trimmedText = currentText.trimEnd();
    if (!trimmedText) {
      return `${tagLines}\n`;
    }

    const separator = trimmedText.endsWith("\n") ? "" : "\n";
    return `${trimmedText}${separator}\n${tagLines}\n`;
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
