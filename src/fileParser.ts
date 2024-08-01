import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';
import ignore from 'ignore';

interface FileNode {
    id: string;
    label: string;
    imports: string[];
}

class FileGraph {
    private nodes: Map<string, FileNode> = new Map();

    addNode(filePath: string, imports: string[]) {
        const id = filePath;
        const label = path.basename(filePath);
        this.nodes.set(id, { id, label, imports });
    }

    getNodes(): FileNode[] {
        return Array.from(this.nodes.values());
    }
}

function parseImports(filePath: string): string[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
    const imports: string[] = [];

    function visit(node: ts.Node) {
        if (ts.isImportDeclaration(node)) {
            const importPath = (node.moduleSpecifier as ts.StringLiteral).text;
            imports.push(importPath);
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return imports;
}

function buildFileGraph(rootPath: string): FileGraph {
    const graph = new FileGraph();
    const ig = ignore();

    // Read .gitignore file
    const gitignorePath = path.join(rootPath, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
        const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
        ig.add(gitignoreContent);
    }

    // Always ignore node_modules
    ig.add('node_modules');

    function traverseDirectory(dirPath: string) {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            const relativePath = path.relative(rootPath, fullPath);

            // Check if the file/directory should be ignored
            if (ig.ignores(relativePath)) {
                continue;
            }

            if (entry.isDirectory()) {
                traverseDirectory(fullPath);
            } else if (entry.isFile() && /\.(ts|js|tsx|jsx)$/.test(entry.name)) {
                const imports = parseImports(fullPath);
                graph.addNode(fullPath, imports);
            }
        }
    }

    traverseDirectory(rootPath);
    return graph;
}

export { FileGraph, buildFileGraph };