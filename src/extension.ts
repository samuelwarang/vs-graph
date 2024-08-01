import * as vscode from 'vscode';
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

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('vs-graph.showFileGraph', () => {
		const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
		if (!rootPath) {
			vscode.window.showErrorMessage('No workspace folder found');
			return;
		}

		const graph = buildFileGraph(rootPath);
		const data = JSON.stringify(graph.getNodes().map(node => ({
			id: node.id,
			label: node.label,
			imports: node.imports
		})));

		const panel = vscode.window.createWebviewPanel('fileGraph', 'File Graph', vscode.ViewColumn.One, {
			enableScripts: true
		});

		panel.webview.html = getWebviewContent(context, data);
	}));
}

function getWebviewContent(context: vscode.ExtensionContext, data: string): string {
	const d3Path = vscode.Uri.file(path.join(context.extensionPath, 'media', 'd3.min.js')).with({ scheme: 'vscode-resource' });

	return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>File Graph</title>
    <script src="${d3Path}"></script>
    <style>
        body { margin: 0; }
        svg { width: 100vw; height: 100vh; }
    </style>
</head>
<body>
    <svg></svg>
    <script>
        console.log("Data received:", ${data});
        const data = ${data};

        if (!data || data.length === 0) {
            console.error("No data available for rendering the graph.");
            return;
        }

        const nodes = data.map(file => ({ id: file.id, label: file.label }));
        const links = data.flatMap(file => file.imports.map(target => ({
            source: file.id,
            target
        })));

        const svg = d3.select("svg");
        const width = window.innerWidth;
        const height = window.innerHeight;

        const simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).distance(100))
            .force("charge", d3.forceManyBody().strength(-200))
            .force("center", d3.forceCenter(width / 2, height / 2));

        const link = svg.append("g")
            .attr("class", "links")
            .selectAll("line")
            .data(links)
            .enter().append("line")
            .attr("stroke", "#aaa");

        const node = svg.append("g")
            .attr("class", "nodes")
            .selectAll("circle")
            .data(nodes)
            .enter().append("circle")
            .attr("r", 5)
            .attr("fill", "#69b3a2")
            .call(drag(simulation));

        const label = svg.append("g")
            .attr("class", "labels")
            .selectAll("text")
            .data(nodes)
            .enter().append("text")
            .text(d => d.label)
            .attr("font-size", "10px")
            .attr("fill", "#000");

        simulation.on("tick", () => {
            link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            node
                .attr("cx", d => d.x)
                .attr("cy", d => d.y);

            label
                .attr("x", d => d.x + 10)
                .attr("y", d => d.y + 5);
        });

        function drag(simulation) {
            function dragstarted(event) {
                if (!event.active) simulation.alphaTarget(0.3).restart();
                event.subject.fx = event.subject.x;
                event.subject.fy = event.subject.y;
            }

            function dragged(event) {
                event.subject.fx = event.x;
                event.subject.fy = event.y;
            }

            function dragended(event) {
                if (!event.active) simulation.alphaTarget(0);
                event.subject.fx = null;
                event.subject.fy = null;
            }

            return d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended);
        }
    </script>
</body>
</html>`;



}
