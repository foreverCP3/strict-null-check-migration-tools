import * as path from "path";
import * as fs from "fs";
import * as ts from "typescript";

/**
 * Given a file, return the list of files it imports as absolute paths.
 */
export function getImportsForFile(file: string, srcRoot: string) {
  console.log(file, "file");

  // Follow symlink so directory check works.
  file = fs.realpathSync(file);

  const options = getTSComplierOptions(process.argv[2]);
  const { paths } = options;

  if (fs.lstatSync(file).isDirectory()) {
    const index = path.join(file, "index.ts");
    const indexTSX = path.join(file, "index.tsx");

    if (fs.existsSync(index)) {
      // https://basarat.gitbooks.io/typescript/docs/tips/barrel.html
      console.warn(`Warning: Barrel import: ${path.relative(srcRoot, file)}`);
      file = index;
    } else if (fs.existsSync(indexTSX)) {
      // https://basarat.gitbooks.io/typescript/docs/tips/barrel.html
      console.warn(`Warning: Barrel import: ${path.relative(srcRoot, file)}`);
      file = indexTSX;
    } else {
      throw new Error(
        `Warning: Importing a directory without an index.ts file: ${path.relative(
          srcRoot,
          file
        )}`
      );
    }
  }

  const fileInfo = ts.preProcessFile(fs.readFileSync(file).toString());
  return (
    fileInfo.importedFiles
      .map((importedFile) => importedFile.fileName)
      // remove svg, css imports
      .filter(
        (fileName) =>
          !fileName.endsWith(".css") &&
          !fileName.endsWith(".svg") &&
          !fileName.endsWith(".json")
      )
      .filter(
        (fileName) => !fileName.endsWith(".js") && !fileName.endsWith(".jsx")
      ) // Assume .js/.jsx imports have a .d.ts available
      .filter(
        (fileName) =>
          /(^\.\/)|(^\.\.\/)/.test(fileName) ||
          Object.keys(paths).some((p) => fileName.startsWith(p))
      )
      .map((fileName) => {
        const targeted = Object.keys(paths).find((p) => fileName.startsWith(p));

        if (targeted) {
          return fileName.replace(
            new RegExp(`^${targeted}`),
            paths[targeted][0]
          );
        }

        return fileName;
      }) // resolve paths defined in tsconfig.json
      .map((fileName) => {
        if (/(^\.\/)|(^\.\.\/)/.test(fileName)) {
          return path.join(path.dirname(file), fileName);
        }
        return path.join(srcRoot, fileName);
      })
      .map((fileName) => {
        if (fs.existsSync(`${fileName}.ts`)) {
          return `${fileName}.ts`;
        }
        if (fs.existsSync(`${fileName}.tsx`)) {
          return `${fileName}.tsx`;
        }
        if (fs.existsSync(`${fileName}.d.ts`)) {
          return `${fileName}.d.ts`;
        }
        if (fs.existsSync(`${fileName}`)) {
          return fileName;
        }
        console.warn(
          `Warning: Unresolved import ${path.relative(srcRoot, fileName)} ` +
            `in ${path.relative(srcRoot, file)}`
        );
        return null;
      })
      .filter((fileName) => !!fileName)
  );
}

/**
 * This class memoizes the list of imports for each file.
 */
export class ImportTracker {
  private imports = new Map<string, string[]>();

  constructor(private srcRoot: string) {}

  public getImports(file: string): string[] {
    if (this.imports.has(file)) {
      return this.imports.get(file);
    }
    const imports = getImportsForFile(file, this.srcRoot);
    this.imports.set(file, imports);
    return imports;
  }
}

export const getTSComplierOptions = (path: string): ts.CompilerOptions => {
  try {
    const nullCheckConfig = JSON.parse(fs.readFileSync(path).toString())
      .compilerOptions as ts.CompilerOptions;

    const baseConfig = JSON.parse(
      fs.readFileSync(path.replace(/\/[^/]+$/, "/tsconfig.json")).toString()
    ).compilerOptions as ts.CompilerOptions;

    return { ...baseConfig, ...nullCheckConfig };
  } catch (error) {
    throw new Error(`cannot get ts config options: \n ${error}`);
  }
};
