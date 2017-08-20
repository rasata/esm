import FastPath from "./fast-path.js"
import Parser from "./parser.js"

import assignmentVisitor from "./visitor/assignment.js"
import createOptions from "./util/create-options.js"
import hasPragma from "./parse/has-pragma.js"
import identifierVisitor from "./visitor/identifier.js"
import importExportVisitor from "./visitor/import-export.js"
import stripShebang from "./util/strip-shebang.js"

const defaultOptions = createOptions({
  cjs: false,
  ext: false,
  hint: "script",
  runtimeAlias: "_",
  type: "module",
  var: false
})

const argumentsRegExp = /\barguments\b/
const importExportRegExp = /\b(?:im|ex)port\b/

class Compiler {
  static compile(code, options) {
    code = stripShebang(code)
    options = createOptions(options, defaultOptions)

    let { hint, type } = options

    const result = {
      code,
      data: null,
      type: "script"
    }

    let useModule

    if (type === "unambiguous" &&
        (hasPragma(code, "use script") ||
          (hint !== "module" &&
            ! importExportRegExp.test(code) &&
            ! (useModule = hasPragma(code, "use module"))
          )
        )) {
      return result
    }

    let ast
    let error

    const parserOptions = {
      allowReturnOutsideFunction: options.cjs,
      enableExportExtensions: options.ext,
      enableImportExtensions: options.ext,
      sourceType: type === "script" ? type : "module"
    }

    try {
      ast = Parser.parse(code, parserOptions)
    } catch (e) {
      error = e
    }

    if (error && type === "unambiguous") {
      type = parserOptions.sourceType = "script"

      try {
        ast = Parser.parse(code, parserOptions)
        error = void 0
      } catch (e) {}
    }

    if (error) {
      throw error
    }

    const rootPath = new FastPath(ast)

    importExportVisitor.visit(rootPath, code, {
      generateVarDeclarations: options.var,
      runtimeAlias: options.runtimeAlias,
      sourceType: type
    })

    if (importExportVisitor.addedImportExport) {
      assignmentVisitor.visit(rootPath, {
        exportedLocalNames: importExportVisitor.exportedLocalNames,
        importedLocalNames: importExportVisitor.importedLocalNames,
        magicString: importExportVisitor.magicString,
        runtimeAlias: importExportVisitor.runtimeAlias
      })

      importExportVisitor.finalizeHoisting()
    }

    if (type === "module" ||
        importExportVisitor.addedImportExport ||
        (type === "unambiguous" &&
          (hint === "module" ||
            (typeof useModule === "boolean"
              ? useModule
              : (useModule = hasPragma(code, "use module"))
            )
          )
        )) {
      result.type = "module"
    }

    if (result.type === "module" &&
        argumentsRegExp.test(code)) {
      identifierVisitor.visit(rootPath)
    }

    result.code = importExportVisitor.magicString.toString()
    return result
  }
}

Object.setPrototypeOf(Compiler.prototype, null)

export default Compiler
