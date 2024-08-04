/* eslint-disable @typescript-eslint/no-var-requires */
import { App, MarkdownPostProcessorContext, MarkdownRenderChild, Platform, Plugin, PluginSettingTab, Setting } from 'obsidian';

// Remember to rename these classes and interfaces!

interface ExtFileCardSettings {
	extPaths: string;
}

const DEFAULT_SETTINGS: ExtFileCardSettings = {
	extPaths: ''
}

export default class ExtFileCard extends Plugin {
	settings: ExtFileCardSettings;

	async onload() {
		// Settings
		this.addSettingTab(new ExtFileCardSettingTab(this.app, this));
		await this.loadSettings();

		// Handlers
		this.registerMarkdownCodeBlockProcessor('ef', this.processor.bind(this));
		this.registerMarkdownCodeBlockProcessor('extfile', this.processor.bind(this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async processor(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		ctx.addChild(new ExtFileCardEl(source, el, this.settings.extPaths.split('\n').filter(val => val).map(val => val.replace(/\\/g, '/'))))
	}
}

class ExtFileCardEl extends MarkdownRenderChild {
	private provideName: string;
	private fileName: string;
	private cTime: string;
	private mTime: string;
	private filePath: string;
	private folderPath: string;

	constructor(source: string, private readonly el: HTMLElement, private readonly extPaths: string[]) {
		super(el);
		this.provideName = source.split('|')[0] ?? ''
		this.fileName = source.split('|')[1] ?? source.replace(/\\/g, '/').split('/').last() as string
	}

	onload() {
		const card = document.createElement('card');
		if (Platform.isDesktop) {
			this.findFile(this.provideName, this.extPaths);
			if (this.filePath === '') {
				card.innerHTML = `
					<file-name><a>${this.fileName}</a></file-name>
					<file-warn>File not found</file-warn>
				`;
			} else {
				card.innerHTML = `
					<file-name><a>${this.fileName}</a></file-name>
					<file-time>Modify: ${this.mTime}</file-time>
					<file-time>Create: ${this.cTime}</file-time>
					<file-path><a>${this.folderPath}</a></file-path>
				`;
				const fileNameLink = card.querySelector('file-name a') as HTMLElement;
				fileNameLink.onclick = this.openFile.bind(this);
				const filePathLink = card.querySelector('file-path a') as HTMLElement;
				filePathLink.onclick = this.openPath.bind(this);
			}
		} else {
			card.innerHTML = `
				<file-name><a>${this.fileName}</a></file-name>
				<file-warn>External file unavailable on mobile</file-warn>
			`;
		}
		this.el.appendChild(card);
	}

	openFile() {
		const { shell } = require('electron')
		shell.openPath(this.filePath);
	}

	openPath() {
		const { shell } = require('electron')
		console.log(this.folderPath)
		const untildify = require('untildify').default;
		shell.openPath(untildify(this.folderPath));
	}

	findFile(source: string, extPaths: string[]) {
		const fs = require('fs');
		const path = require('path');
		const glob = require('glob');
		const untildify = require('untildify').default;
		for (let index = 0; index < extPaths.length; index++) {
			const extPath = untildify(extPaths[index]) + (extPaths[index].endsWith('/') ? '' : '/');
			this.filePath = glob.sync(extPath + '**/' + source)[0] ?? '';
			if (this.filePath === '') {
				continue;
			}
			const stats = fs.statSync(this.filePath);
			this.cTime = stats.ctime.toLocaleString();
			this.mTime = stats.mtime.toLocaleString();
			this.folderPath = path.dirname(this.filePath).replace(untildify(extPaths[index]), extPaths[index]);
			return;
		}
		this.filePath = '';
	}
}

class ExtFileCardSettingTab extends PluginSettingTab {
	plugin: ExtFileCard;

	constructor(app: App, plugin: ExtFileCard) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('External File Card')
			.setHeading();

		new Setting(containerEl)
			.setName('External paths')
			.setDesc('External paths to search for files. Accepts one or multiple paths, one in each line. Paths in the top has higher priority. `~` is allowed.')
			.addTextArea(text => {
				text.setValue(this.plugin.settings.extPaths)
					.onChange(async value => {
						this.plugin.settings.extPaths = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.cols = 40;
				text.inputEl.rows = 5;
				text.inputEl.style.resize = 'none';
			});
	}
}
