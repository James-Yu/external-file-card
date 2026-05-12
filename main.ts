/* eslint-disable @typescript-eslint/no-var-requires */
import {
    App,
    MarkdownPostProcessorContext,
    MarkdownRenderChild,
    Notice,
    ObsidianProtocolData,
    Platform,
    Plugin,
    PluginSettingTab,
    Setting,
} from 'obsidian'

interface ExtFileCardSettings {
    extPaths: string
    langId: string
}

const DEFAULT_SETTINGS: ExtFileCardSettings = {
    extPaths: '',
    langId: 'ef',
}

export default class ExtFileCard extends Plugin {
    settings: ExtFileCardSettings = DEFAULT_SETTINGS

    async onload() {
        // Settings
        this.addSettingTab(new ExtFileCardSettingTab(this.app, this))
        await this.loadSettings()

        // Handlers
        this.registerMarkdownCodeBlockProcessor('ef', this.efBlockProcessor.bind(this))
        this.registerMarkdownCodeBlockProcessor('extfile', this.efBlockProcessor.bind(this))
        this.registerMarkdownCodeBlockProcessor('efc', this.efcBlockProcessor.bind(this))
        this.registerMarkdownCodeBlockProcessor('extfilec', this.efcBlockProcessor.bind(this))
        this.registerObsidianProtocolHandler('ef', this.uriProcessor.bind(this))
        this.registerObsidianProtocolHandler('extfile', this.uriProcessor.bind(this))

        // Commands
        this.addCommand({
            id: 'external-file-card-insert-block',
            name: 'Insert external file card',
            editorCallback: (editor, _) => {
                if (!editor.somethingSelected) {
                    return
                }
                editor.replaceSelection(`\n\`\`\`${this.settings.langId}\n${editor.getSelection()}\n\`\`\`\n`)
            },
        })
        this.addCommand({
            id: 'external-file-card-insert-link',
            name: 'Insert external file link',
            editorCallback: (editor, _) => {
                if (!editor.somethingSelected) {
                    return
                }
                editor.replaceSelection(
                    `[${editor.getSelection()}]` +
                        `(obsidian://${this.settings.langId}` +
                        `?${editor.getSelection().replace(/\s/g, ':')})`,
                )
            },
        })
    }

    onunload() {}

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
    }

    async saveSettings() {
        await this.saveData(this.settings)
    }

    get extPaths() {
        return this.settings.extPaths
            .split('\n')
            .filter((val) => val)
            .map((val) => val.replace(/\\/g, '/'))
    }

    async efBlockProcessor(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        ctx.addChild(new ExtFileCardEl(source, el, this.extPaths))
    }

    async efcBlockProcessor(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        ctx.addChild(new ExtFileCardEl(source, el, this.extPaths, { compact: true }))
    }

    async uriProcessor(params: ObsidianProtocolData) {
        const source =
            Object.entries(params)
                .find(([key, value]) => key !== '' && value === 'true')?.[0]
                .replace(/:/g, ' ') ?? decodeURIComponent(params.hash ?? '')
        if (Platform.isDesktop) {
            const result = ExtFileCard.findFile(source, this.extPaths)
            if (result !== undefined) {
                ExtFileCard.openFile(result.filePath)
            } else {
                new Notice(`File not found: ${source}`)
            }
        }
    }

    static findFile(source: string, extPaths: string[]) {
        const fs = require('fs') as typeof import('fs')
        const path = require('path') as typeof import('path')
        const glob = require('glob') as typeof import('glob')
        const untildify = require('untildify').default
        for (let index = 0; index < extPaths.length; index++) {
            const extPath = untildify(extPaths[index]) + (extPaths[index].endsWith('/') ? '' : '/')
            const filePath = glob.sync(extPath + '**/' + source)[0] ?? ''
            if (filePath === '') {
                continue
            }
            const stats: import('fs').Stats = fs.statSync(filePath)
            return {
                filePath,
                folderPath: path.dirname(filePath).replace(untildify(extPaths[index]), extPaths[index]),
                stats,
            }
        }
        return
    }

    static openFile(filePath: string) {
        const { shell } = require('electron')
        shell.openPath(filePath)
    }

    static openPath(folderPath: string) {
        const { shell } = require('electron')
        const untildify = require('untildify').default
        shell.openPath(untildify(folderPath))
    }
}

class ExtFileCardComponent {
    private provideName: string
    private displayName: string

    // source should be a single line of ExtFileCard string
    // example: This_is_a_file_name.ext|This is a display name
    constructor(
        source: string,
        private readonly extPaths: string[],
    ) {
        const segments = source.split('|')
        this.provideName = segments[0] ?? ''
        this.displayName =
            segments[1] ??
            (source
                .replace(/\\/g, '/')
                .split('/')
                .filter((seg) => seg)
                .last() as string)
    }

    toHTML(config: { compact?: boolean } = {}): HTMLElement {
        const container = document.createElement('ext-file-component')
        if (config.compact) {
            container.classList.add('compact')
        }
        const nameEl = container.createDiv({ cls: 'file-name' }).createEl('a', { text: this.displayName })

        // Mobile warning
        if (!Platform.isDesktop) {
            container.createDiv({
                cls: 'file-warn',
                text: config.compact ? 'Unavailable on mobile' : 'External file unavailable on mobile',
            })
            return container
        }

        const result = ExtFileCard.findFile(this.provideName, this.extPaths)

        // File not found
        if (result === undefined) {
            container.createDiv({
                cls: 'file-warn',
                text: config.compact ? 'Not found' : 'File not found',
            })
            return container
        }

        if (result.stats.isFile()) {
            ExtFileCardComponent.renderFileDetails(container, nameEl, result, config)
        } else if (result.stats.isDirectory()) {
            ExtFileCardComponent.renderFolderDetails(container, nameEl, result)
        }

        return container
    }

    private static renderFileDetails(
        container: HTMLElement,
        nameEl: HTMLAnchorElement,
        result: { filePath: string; folderPath: string; stats: import('fs').Stats },
        config: { compact?: boolean },
    ) {
        const moment = require('moment') as typeof import('moment')
        const modifyText = config.compact
            ? `M${moment(result.stats.mtime).format('YYYY-MM-DD')}`
            : `Modify: ${moment(result.stats.mtime).format('YYYY-MM-DD HH:mm')}`
        const createText = config.compact
            ? `C${moment(result.stats.ctime).format('YYYY-MM-DD')}`
            : `Create: ${moment(result.stats.ctime).format('YYYY-MM-DD HH:mm')}`
        const pathText = config.compact ? '📁' : result.folderPath

        container.createDiv({ cls: 'file-time', text: modifyText })
        container.createDiv({ cls: 'file-time', text: createText })
        const pathEl = container.createDiv({ cls: 'file-path' }).createEl('a', { text: pathText })

        nameEl.onclick = () => ExtFileCard.openFile(result.filePath)
        pathEl.onclick = () => ExtFileCard.openPath(result.folderPath)
    }

    private static renderFolderDetails(
        container: HTMLElement,
        nameEl: HTMLAnchorElement,
        result: { filePath: string; folderPath: string; stats: import('fs').Stats },
    ) {
        const fs = require('fs') as typeof import('fs')
        const path = require('path') as typeof import('path')
        const children = ExtFileCardComponent.sortFolderChildren(
            fs.readdirSync(result.filePath),
            result.filePath,
        ).filter((child) => {
            return !['.DS_Store', 'Thumbs.db'].includes(child)
        })
        const { fileCount, folderCount } = ExtFileCardComponent.countFolderChildren(children, result.filePath)
        container.createDiv({ cls: 'file-time', text: `Files: ${fileCount}, Folders: ${folderCount}` })

        const listContainer = container.createEl('ul', { cls: 'file-list' })
        children.forEach((child: string) => {
            const childEl = listContainer.createEl('li', { cls: 'file-name' }).createEl('a', { text: child })
            childEl.onclick = () => ExtFileCard.openPath(path.join(result.filePath, child))
        })
        nameEl.onclick = () => ExtFileCard.openPath(result.filePath)
    }

    private static countFolderChildren(children: string[], folderPath: string) {
        const fs = require('fs') as typeof import('fs')
        const path = require('path') as typeof import('path')
        let fileCount = 0
        let folderCount = 0
        children.forEach((child) => {
            const stats = fs.statSync(path.join(folderPath, child))
            if (stats.isFile()) {
                fileCount++
            } else if (stats.isDirectory()) {
                folderCount++
            }
        })
        return { fileCount, folderCount }
    }

    private static sortFolderChildren(children: string[], folderPath: string) {
        const fs = require('fs') as typeof import('fs')
        const path = require('path') as typeof import('path')
        return children.sort((a, b) => {
            const aIsDir = fs.statSync(path.join(folderPath, a)).isDirectory()
            const bIsDir = fs.statSync(path.join(folderPath, b)).isDirectory()
            if (aIsDir && !bIsDir) {
                return -1
            } else if (!aIsDir && bIsDir) {
                return 1
            } else {
                return a.localeCompare(b)
            }
        })
    }
}

class ExtFileCardEl extends MarkdownRenderChild {
    private extFileCardComponents: ExtFileCardComponent[]

    constructor(
        source: string,
        private readonly el: HTMLElement,
        private readonly extPaths: string[],
        private readonly config: { compact?: boolean } = {},
    ) {
        super(el)
        this.extFileCardComponents = source
            .split('\n')
            .filter((line) => line)
            .map((line) => new ExtFileCardComponent(line, extPaths))
    }

    onload() {
        const card = document.createElement('ext-file-card')
        this.extFileCardComponents.forEach((component, index, _) => {
            card.appendChild(component.toHTML(this.config))
            if (index !== this.extFileCardComponents.length - 1) {
                card.appendChild(document.createElement('hr'))
            }
        })
        this.el.appendChild(card)
    }
}

class ExtFileCardSettingTab extends PluginSettingTab {
    plugin: ExtFileCard

    constructor(app: App, plugin: ExtFileCard) {
        super(app, plugin)
        this.plugin = plugin
    }

    display(): void {
        const { containerEl } = this

        containerEl.empty()

        new Setting(containerEl)
            .setName('External paths')
            .setDesc(
                'External paths to search for files. Accepts one or multiple paths, one in each line. Paths in the top has higher priority. `~` is allowed.',
            )
            .addTextArea((text) => {
                text.setValue(this.plugin.settings.extPaths).onChange(async (value) => {
                    this.plugin.settings.extPaths = value
                    await this.plugin.saveSettings()
                })
                text.inputEl.cols = 40
                text.inputEl.rows = 5
            })

        new Setting(containerEl)
            .setName('Language identifier')
            .setDesc(
                'Use short language identifier `ef` instead of the full identifier `extfile`. This setting only affects the code block and link generated by commands.',
            )
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.langId === 'ef').onChange(async (value) => {
                    this.plugin.settings.langId = value ? 'ef' : 'extfile'
                    await this.plugin.saveSettings()
                })
            })
    }
}
