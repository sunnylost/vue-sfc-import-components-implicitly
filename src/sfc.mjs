import vueCompiler from 'vue-template-compiler'
import pug from 'pug'
import validTags from './validTags.mjs'
import * as walk from 'acorn-walk'
import * as acorn from 'acorn'
import path from 'path'

function transformComponentNameToDashStyle(name) {
    return name.replace(/[A-Z]/g, (match, index) => {
        return `${index === 0 ? '' : '-'}${match.toLowerCase()}`
    })
}

export default function compile(fileContent, filePath) {
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
                let properties
                /**
                 * composition-api
                 */
                if (
                    node.declaration.type === 'CallExpression' &&
                    node.declaration.callee.name === 'defineComponent'
                ) {
                    properties = node.declaration.arguments[0].properties
                } else {
                    properties = node.declaration.properties
                }

                properties?.forEach(property => {
                    if (property?.key?.name === 'name') {
                        currentComponentName = transformComponentNameToDashStyle(
                            property.value.value
                        )
                    }

                    if (property?.key?.name === 'components') {
                        components = property.value?.properties?.map(item =>
                            transformComponentNameToDashStyle(item.key.name)
                        )
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
