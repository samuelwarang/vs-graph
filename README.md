# VS Graph

VS Graph is a Visual Studio Code extension that generates and visualizes a graph of your project's file structure and import relationships. This extension helps you understand the architecture and dependencies of your project at a glance.

![image](https://github.com/user-attachments/assets/6e9db2a3-5dd0-4b32-b2b1-97ce52c5e9d7)

## Features

- Parses your project structure and creates nodes for each file and folder
- Analyzes imports in JavaScript and TypeScript files (.js, .ts, .jsx, .tsx)
- Generates a interactive graph visualization of your project structure
- Displays files, folders, and dependencies as different node types
- Shows import relationships as links between nodes
- Provides an interactive graph with zoom and pan capabilities
- Allows customization of graph layout and appearance

## Installation

1. Open Visual Studio Code
2. Go to the Extensions view (Ctrl+Shift+X or Cmd+Shift+X)
3. Search for "VS Graph"
4. Click Install

Alternatively, you can download the VSIX file from the [releases page](https://github.com/yourusername/vs-graph/releases) and install it manually.

## Usage

1. Open a project folder in VS Code
2. Open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P)
3. Type "Show File Graph" and select the command
4. The graph visualization will open in a new tab

## Graph Interaction

- Zoom: Use the mouse wheel or trackpad gestures
- Pan: Click and drag on the background
- Move Nodes: Click and drag individual nodes
- View Node Details: Hover over a node to see its full path

## Customization

You can customize the graph appearance and behavior using the controls in the top-left corner of the graph view:

- Toggle Background: Switch between a white background and a transparent background
- Center Force: Adjust how strongly nodes are pulled towards the center
- Repel Force: Change how strongly nodes repel each other
- Node Size: Modify the base size of the nodes

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [D3.js](https://d3js.org/) for the graph visualization
- [ignore](https://github.com/kaelzhang/node-ignore) for .gitignore parsing

## Support

If you encounter any issues or have feature requests, please file an issue on the [GitHub repository](https://github.com/yourusername/vs-graph/issues).
