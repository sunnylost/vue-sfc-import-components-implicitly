import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import glob from 'glob'
import vueCompiler from 'vue-template-compiler'
import * as acorn from 'acorn'
import * as walk from 'acorn-walk'
import pug from 'pug'
import validTags from './validTags.mjs'

function transformComponentNameToDashStyle(name) {
    return name.replace(/[A-Z]/g, (match, index) => {
        return `${index === 0 ? '' : '-'}${match.toLowerCase()}`
    })
}

function compileSFC(fileContent, filePath) {
    const { template, script } = vueCompiler.parseComponent(fileContent)

    const explicitImportedComponents = collectExplicitImportComponents(script.content, filePath)
    const allComponents = collectAllComponentsInvokedFromTemplate(template)
    const implicitImportedComponents = []

    allComponents.forEach(rawComponentName => {
        const componentName = transformComponentNameToDashStyle(rawComponentName)

        if (!explicitImportedComponents.includes(componentName)) {
            implicitImportedComponents.push(componentName)
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
    return Object.keys(customTagsMap).map(name => transformComponentNameToDashStyle(name))
}

function collectExplicitImportComponents(scriptContent, filePath) {
    let components = []
    let currentComponentName

    walk.simple(
        acorn.parse(scriptContent, {
            ecmaVersion: 'latest',
            sourceType: 'module'
        }),
        {
            ExportDefaultDeclaration(node) {
                node.declaration.properties.some(property => {
                    if (property?.key?.name === 'name') {
                        currentComponentName = transformComponentNameToDashStyle(
                            property.value.value
                        )
                    }

                    if (property?.key?.name === 'components') {
                        components = property.value?.properties?.map(item =>
                            transformComponentNameToDashStyle(item.key.name)
                        )
                        return true
                    }
                })
            }
        }
    )

    if (!currentComponentName) {
        currentComponentName = transformComponentNameToDashStyle(
            filePath
                .split(path.sep)
                .pop()
                .replace(/\.vue$/, '')
        )
    }

    if (!components.includes(currentComponentName)) {
        components.push(currentComponentName)
    }

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
                let { implicitImportedComponents } = compileSFC(content, filePath)

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
