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

// Remember to rename these classes and interfaces!

interface ExtFileCardSettings {
    extPaths: string
    langId: string
}

const DEFAULT_SETTINGS: ExtFileCardSettings = {
    extPaths: '',
    langId: 'ef',
}

export default class ExtFileCard extends Plugin {
    settings: ExtFileCardSettings

    async onload() {
        // Settings
        this.addSettingTab(new ExtFileCardSettingTab(this.app, this))
        await this.loadSettings()

        // Handlers
        this.registerMarkdownCodeBlockProcessor('ef', this.codeBlockProcessor.bind(this))
        this.registerMarkdownCodeBlockProcessor('extfile', this.codeBlockProcessor.bind(this))
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
                        `(obsidian://${this.settings.langId}#${encodeURIComponent(editor.getSelection())})`
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

    async codeBlockProcessor(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
        ctx.addChild(new ExtFileCardEl(source, el, this.extPaths))
    }

    async uriProcessor(params: ObsidianProtocolData) {
        const source = decodeURIComponent(params.hash ?? '')
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
        const fs = require('fs')
        const path = require('path')
        const glob = require('glob')
        const untildify = require('untildify').default
        for (let index = 0; index < extPaths.length; index++) {
            const extPath = untildify(extPaths[index]) + (extPaths[index].endsWith('/') ? '' : '/')
            const filePath = glob.sync(extPath + '**/' + source)[0] ?? ''
            if (filePath === '') {
                continue
            }
            const stats = fs.statSync(filePath)
            return {
                filePath,
                folderPath: path.dirname(filePath).replace(untildify(extPaths[index]), extPaths[index]),
                cTime: stats.ctime.toLocaleString(),
                mTime: stats.mtime.toLocaleString(),
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

class ExtFileCardEl extends MarkdownRenderChild {
    private provideName: string
    private displayName: string

    constructor(source: string, private readonly el: HTMLElement, private readonly extPaths: string[]) {
        super(el)
        this.provideName = source.split('|')[0] ?? ''
        this.displayName = source.split('|')[1] ?? (source.replace(/\\/g, '/').split('/').last() as string)
    }

    onload() {
        const card = document.createElement('ext-file-card')
        const nameEl = card.createDiv({ cls: 'file-name' }).createEl('a', { text: this.displayName })

        if (Platform.isDesktop) {
            const result = ExtFileCard.findFile(this.provideName, this.extPaths)
            if (result === undefined) {
                card.createDiv({ cls: 'file-warn', text: 'File not found' })
            } else {
                card.createDiv({ cls: 'file-time', text: `Modify: ${result.mTime}` })
                card.createDiv({ cls: 'file-time', text: `Create: ${result.cTime}` })
                const pathEl = card.createDiv({ cls: 'file-path' }).createEl('a', { text: result.folderPath })

                nameEl.onclick = () => ExtFileCard.openFile(result.filePath)
                pathEl.onclick = () => ExtFileCard.openPath(result.folderPath)
            }
        } else {
            card.createDiv({ cls: 'file-warn', text: 'External file unavailable on mobile' })
        }
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

        new Setting(containerEl).setName('External File Card').setHeading()

        new Setting(containerEl)
            .setName('External paths')
            .setDesc(
                'External paths to search for files. Accepts one or multiple paths, one in each line. Paths in the top has higher priority. `~` is allowed.'
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
                'Use short language identifier `ef` instead of the full identifier `extfile`. This setting only affects the code block and link generated by commands.'
            )
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.langId === 'ef').onChange(async (value) => {
                    this.plugin.settings.langId = value ? 'ef' : 'extfile'
                    await this.plugin.saveSettings()
                })
            })
    }
}
