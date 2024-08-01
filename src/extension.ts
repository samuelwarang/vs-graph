import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import ignore from 'ignore';

interface Node {
    id: string;
    imports: string[];
    isExternal?: boolean;
    type: 'file' | 'folder' | 'dependency';
}

interface Link {
    source: string;
    target: string;
}

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('vs-graph.showFileGraph', () => {
        const graph = buildGraph();
        showGraphView(context, graph);
    });

    context.subscriptions.push(disposable);
}

function buildGraph(): { nodes: Node[], links: Link[] } {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage('No workspace folder open');
        return { nodes: [], links: [] };
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const nodes: Node[] = [];
    const links: Link[] = [];
    const nodeMap = new Map<string, Node>();
    const ig = ignore().add(fs.readFileSync(path.join(rootPath, '.gitignore'), 'utf8'));

    function addNode(id: string, type: 'file' | 'folder' | 'dependency', isExternal: boolean = false) {
        if (!nodeMap.has(id)) {
            const node: Node = { id, imports: [], isExternal, type };
            nodeMap.set(id, node);
            nodes.push(node);
        }
        return nodeMap.get(id)!;
    }

    function traverseDirectory(dir: string) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const filePath = path.join(dir, file);
            const relativePath = path.relative(rootPath, filePath);

            if (ig.ignores(relativePath) || file === 'node_modules') {
                continue;
            }

            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
                addNode(relativePath, 'folder');
                traverseDirectory(filePath);
            } else if (path.extname(file) === '.ts' || path.extname(file) === '.js') {
                const content = fs.readFileSync(filePath, 'utf8');
                const imports = parseImports(content);
                const node = addNode(relativePath, 'file');
                node.imports = imports;

                for (const imp of imports) {
                    addNode(imp, 'dependency', true);
                    links.push({ source: relativePath, target: imp });
                }
            }
        }
    }

    traverseDirectory(rootPath);

    // Add dependencies from package.json
    const packageJsonPath = path.join(rootPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const dependencies = Object.keys(packageJson.dependencies || {});
        dependencies.forEach(dep => {
            addNode(dep, 'dependency', true);
        });
    }

    // Remove orphan nodes
    const connectedNodes = new Set(links.flatMap(link => [link.source, link.target]));
    return {
        nodes: nodes.filter(node => connectedNodes.has(node.id)),
        links
    };
}

function parseImports(content: string): string[] {
    const importRegex = /import\s+.*?from\s+['"](.+?)['"]/g;
    const imports: string[] = [];
    let match;
    while ((match = importRegex.exec(content)) !== null) {
        imports.push(match[1]);
    }
    return imports;
}

function showGraphView(context: vscode.ExtensionContext, graph: { nodes: Node[], links: Link[] }) {
    const panel = vscode.window.createWebviewPanel(
        'importExportGraph',
        'Import/Export Graph',
        vscode.ViewColumn.One,
        {
            enableScripts: true
        }
    );

    panel.webview.html = getWebviewContent(context, graph, panel);
}

function getWebviewContent(context: vscode.ExtensionContext, graph: { nodes: Node[], links: Link[] }, panel: vscode.WebviewPanel): string {
    const d3Path = vscode.Uri.joinPath(context.extensionUri, 'node_modules', 'd3', 'dist', 'd3.min.js');
    const d3Uri = panel.webview.asWebviewUri(d3Path);

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Import/Export Graph</title>
            <script src="${d3Uri}"></script>
            <style>
                body { margin: 0; padding: 0; overflow: hidden; }
                #graph { width: 100vw; height: 100vh; }
                #error { color: red; font-size: 18px; margin: 20px; }
                #controls { position: absolute; top: 10px; left: 10px; z-index: 1000; }
                #colorButton { margin-bottom: 10px; }
            </style>
        </head>
        <body>
            <div id="controls">
                <button id="colorButton">Toggle Background</button>
                <div>
                    <label for="centerForce">Center Force</label>
                    <input type="range" id="centerForce" min="0" max="2" step="0.1" value="1">
                </div>
                <div>
                    <label for="repelForce">Repel Force</label>
                    <input type="range" id="repelForce" min="-2000" max="0" step="100" value="-300">
                </div>
            </div>
            <div id="error"></div>
            <div id="graph"></div>
            <script>
                (function() {
                    function showError(message) {
                        document.getElementById('error').textContent = message;
                        vscode.postMessage({ command: 'alert', text: message });
                    }

                    let isTransparent = false;
                    document.getElementById('colorButton').addEventListener('click', () => {
                        isTransparent = !isTransparent;
                        document.body.style.backgroundColor = isTransparent ? 'transparent' : 'white';
                    });

                    try {
                        const graph = ${JSON.stringify(graph)};
                        console.log('Graph data:', graph);
                        
                        if (!graph || !graph.nodes || !graph.links) {
                            throw new Error('Invalid graph data');
                        }

                        if (graph.nodes.length === 0) {
                            showError('No nodes found in the graph. The project might be empty or there might be an issue with file parsing.');
                            return;
                        }

                        const width = window.innerWidth;
                        const height = window.innerHeight;

                        const svg = d3.select("#graph")
                            .append("svg")
                            .attr("width", width)
                            .attr("height", height);

                        console.log('SVG created');

                        const simulation = d3.forceSimulation(graph.nodes)
                            .force("link", d3.forceLink(graph.links).id(d => d.id))
                            .force("charge", d3.forceManyBody().strength(-300))
                            .force("center", d3.forceCenter(width / 2, height / 2));

                        console.log('Simulation created');

                        const link = svg.append("g")
                            .attr("stroke", "#999")
                            .attr("stroke-opacity", 0.6)
                            .selectAll("line")
                            .data(graph.links)
                            .join("line");

                        const node = svg.append("g")
                            .attr("stroke", "#fff")
                            .attr("stroke-width", 1.5)
                            .selectAll("circle")
                            .data(graph.nodes)
                            .join("circle")
                            .attr("r", 5)
                            .attr("fill", d => d.type === 'dependency' ? "#ff7f0e" : d.type === 'file' ? "#69b3a2" : "#1f77b4")
                            .call(drag(simulation));

                        node.append("title")
                            .text(d => d.id);

                        console.log('Nodes and links created');

                        const labels = svg.append("g")
                            .attr("class", "labels")
                            .selectAll("text")
                            .data(graph.nodes)
                            .enter().append("text")
                            .attr("dx", 12)
                            .attr("dy", ".35em")
                            .text(d => d.id);

                        simulation.on("tick", () => {
                            link
                                .attr("x1", d => d.source.x)
                                .attr("y1", d => d.source.y)
                                .attr("x2", d => d.target.x)
                                .attr("y2", d => d.target.y);

                            node
                                .attr("cx", d => d.x)
                                .attr("cy", d => d.y);

                            labels
                                .attr("x", d => d.x)
                                .attr("y", d => d.y);
                        });

                        console.log('Tick function set');

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

                        const centerForceInput = document.getElementById('centerForce');
                        centerForceInput.addEventListener('input', () => {
                            simulation.force('center', d3.forceCenter(width / 2, height / 2).strength(centerForceInput.value));
                            simulation.alpha(1).restart();
                        });

                        const repelForceInput = document.getElementById('repelForce');
                        repelForceInput.addEventListener('input', () => {
                            simulation.force('charge', d3.forceManyBody().strength(repelForceInput.value));
                            simulation.alpha(1).restart();
                        });

                        console.log('Script completed successfully');
                    } catch (error) {
                        console.error('Error:', error);
                        showError('An error occurred: ' + error.message);
                    }
                })();
            </script>
        </body>
        </html>
    `;
}
