import fs from 'fs'
import { promisify } from 'util'
import chalk from 'chalk'
import glob from 'glob'
import compile from './sfc.mjs'

const readFile = promisify(fs.readFile)

export async function parseSingleFile(filePath, config) {
    const content = await readFile(filePath, {
        encoding: 'utf-8'
    })
    const { filter } = config
    let { implicitImportedComponents } = compile(content, filePath, config)

    if (typeof filter === 'function') {
        implicitImportedComponents = implicitImportedComponents.filter(item => filter(item))
    }

    if (implicitImportedComponents.length) {
        console.log(
            `${chalk.green(filePath)} has implicit import components:\n ${implicitImportedComponents
                .map(name => chalk.yellow(name))
                .join(', ')}\n`
        )
    }
}

export default async (filePathGlobs, config = {}) => {
    glob(filePathGlobs, (err, files) => {
        if (err) {
            console.error(err)
        } else {
            files.forEach(filePath => {
                parseSingleFile(filePath, config)
            })
        }
    })
}
