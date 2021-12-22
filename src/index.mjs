import fs from 'fs'
import chalk from 'chalk'
import glob from 'glob'
import vueCompiler from 'vue-template-compiler'
import * as acorn from 'acorn'
import * as walk from 'acorn-walk'
import pug from 'pug'
import validTags from './validTags.mjs'

function normalizeComponentName(name) {
    return name.replace(/-/g, '').toLowerCase()
}

function compileSFC(fileContent) {
    const { template, script } = vueCompiler.parseComponent(fileContent)

    const explicitImportedComponents = collectExplicitImportComponents(script.content)
    const allComponents = collectAllComponentsInvokedFromTemplate(template)
    const implicitImportedComponents = []

    allComponents.forEach(rawComponentName => {
        const componentName = normalizeComponentName(rawComponentName)

        if (!explicitImportedComponents.includes(componentName)) {
            implicitImportedComponents.push(rawComponentName)
        }
    })

    return {
        allComponents,
        explicitImportedComponents,
        implicitImportedComponents
    }
}

function collectAllComponentsInvokedFromTemplate(template) {
    const { content, lang } = template
    const html = lang === 'pug' ? pug.compile(content)() : content
    const { ast } = vueCompiler.compile(html, {
        whitespace: 'condense'
    })
    const customTagsMap = {}
    const innerTagCollector = node => {
        if (!node.tag) {
            return
        }

        if (!validTags.includes(node.tag)) {
            customTagsMap[node.tag] = 1
        }

        if (Array.isArray(node.children)) {
            node.children.forEach(child => {
                innerTagCollector(child)
            })
        }
    }

    innerTagCollector(ast)
    return Object.keys(customTagsMap)
}

function collectExplicitImportComponents(scriptContent) {
    let components = []

    walk.simple(
        acorn.parse(scriptContent, {
            ecmaVersion: 'latest',
            sourceType: 'module'
        }),
        {
            ExportDefaultDeclaration(node) {
                node.declaration.properties.some(property => {
                    if (property?.key?.name === 'components') {
                        components = property.value?.properties?.map(item =>
                            normalizeComponentName(item.key.name)
                        )
                        return true
                    }
                })
            }
        }
    )

    return components
}

export function parseSingleFile(filePath, { filter }) {
    fs.readFile(
        filePath,
        {
            encoding: 'utf8'
        },
        (err, content) => {
            if (err) {
                console.error(err)
            } else {
                let { implicitImportedComponents } = compileSFC(content)

                if (typeof filter === 'function') {
                    implicitImportedComponents = implicitImportedComponents.filter(item =>
                        filter(item)
                    )
                }

                if (implicitImportedComponents.length) {
                    console.log(
                        `${chalk.green(
                            filePath
                        )} has implicit import components:\n ${implicitImportedComponents
                            .map(name => chalk.yellow(name))
                            .join(', ')}\n`
                    )
                }
            }
        }
    )
}

export default async (fileGlobs, config = {}) => {
    glob(fileGlobs, (err, files) => {
        files.forEach(filePath => {
            parseSingleFile(filePath, config)
        })
    })
}
