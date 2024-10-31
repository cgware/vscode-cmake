import * as vscode from 'vscode';
import * as path from 'path';
import { existsSync, readFileSync } from 'fs';

abstract class ProjectItem extends vscode.TreeItem {
	abstract getChildren(): ProjectItem[];
}

enum CMakeTargetType {
	BUILD,
	RUN,
}

abstract class CMakeTarget extends ProjectItem {
	public name: string;
	public type: CMakeTargetType;

	protected constructor(name: string, type: CMakeTargetType) {
		super(name, vscode.TreeItemCollapsibleState.None);
		this.name = name;
		this.type = type;
	}

	getChildren(): ProjectItem[] {
		return [];
	}

	protected build(cmake: CMake, terminal: Terminal) {
		cmake.build(terminal, this.name);
	}

	abstract launch(cmake: CMake, terminal: Terminal): void;
}

class CMakeBuildTarget extends CMakeTarget {
	constructor(name: string) {
		super(name, CMakeTargetType.BUILD);
		this.command = {
			command: 'cgware-vscode-cmake.build',
			title: 'Build ' + name,
			arguments: [this]
		};
	}

	launch(cmake: CMake, terminal: Terminal) {
		this.build(cmake, terminal);
	}
}

class CMakeRunTarget extends CMakeTarget {
	public file: string;

	constructor(name: string, file: string) {
		super(name, CMakeTargetType.RUN);
		this.command = {
			command: 'cgware-vscode-cmake.run',
			title: 'Run ' + name,
			arguments: [this]
		};
		this.file = file;
	}

	run(cmake: CMake, terminal: Terminal) {
		this.build(cmake, terminal);
		terminal.exec(this.file);
	}

	launch(cmake: CMake, terminal: Terminal) {
		this.run(cmake, terminal);
	}
}

class CMake {
	public root_path: string;
	public src_path: string;
	public build_path: string;
	public files: string[] = [];
	public targets: CMakeTarget[] = [
		new CMakeBuildTarget('all'),
		new CMakeBuildTarget('clean'),
	];

	constructor(root_path: string) {
		this.root_path = root_path;
		this.src_path = root_path;
		this.build_path = root_path + '/build';
	}

	config(terminal: Terminal) {
		terminal.exec('cmake -S ' + this.src_path + ' -B ' + this.build_path);
	}

	build(terminal: Terminal, target: string) {
		if (!existsSync(this.build_path)) {
			this.config(terminal);
		}

		terminal.exec('cmake --build ' + this.build_path + ' --target ' + target);
	}
}

class Terminal {
	private open: Boolean;
	private terminal: vscode.Terminal;

	constructor() {
		this.terminal = vscode.window.createTerminal('cmake');
		this.terminal.show();
		this.open = true;

		vscode.window.onDidCloseTerminal((closedTerminal) => {
			if (closedTerminal === this.terminal) {
				this.open = false;
			}
		});
	}

	exec(cmd: string) {
		if (!this.open) {
			this.terminal = vscode.window.createTerminal('cmake');
			this.terminal.show();
			this.open = true;
		}

		this.terminal.sendText(cmd, true);
	}
}

class LaunchItem extends ProjectItem {
	private cmake: CMake;
	private type: CMakeTargetType;

	protected constructor(cmake: CMake, type: CMakeTargetType, label: string) {
		super(label, vscode.TreeItemCollapsibleState.Expanded);
		this.cmake = cmake;
		this.type = type;
	}

	getChildren(): ProjectItem[] {
		return this.cmake.targets.filter(target => target.type === this.type);
	}
}

class BuildItem extends LaunchItem {
	constructor(cmake: CMake) {
		super(cmake, CMakeTargetType.BUILD, "Build");
	}
}

class RunItem extends LaunchItem {
	constructor(cmake: CMake) {
		super(cmake, CMakeTargetType.RUN, "Run");
	}
}

class ProjectProvider implements vscode.TreeDataProvider<ProjectItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<ProjectItem | undefined | void> = new vscode.EventEmitter<ProjectItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<ProjectItem | undefined | void> = this._onDidChangeTreeData.event;
	private cmake: CMake;

	constructor(cmake: CMake) {
		this.cmake = cmake;
	}

	getTreeItem(element: ProjectItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: ProjectItem): ProjectItem[] {
		if (!element) {
			return [
				new BuildItem(this.cmake),
				new RunItem(this.cmake),
			];
		}

		return element.getChildren();
	}

	setCMake(cmake: CMake) {
		this.cmake = cmake;
		this._onDidChangeTreeData.fire();
	}
}

export function activate(context: vscode.ExtensionContext) {
	if (vscode.workspace.workspaceFolders === undefined) {
		vscode.window.showErrorMessage('CMake: Working folder not found, open a folder and try again');
		return;
	}

	const wf = vscode.workspace.workspaceFolders[0].uri.fsPath;

	let terminal = new Terminal();
	let cmake: CMake = new CMake(wf);
	let last_target: CMakeTarget | undefined;
	const projectProvider = new ProjectProvider(cmake);

	cmake_refresh();

	vscode.workspace.onDidSaveTextDocument((document) => {
		const path = document.fileName;
		if (!cmake.files.includes(path)) {
			return;
		}

		vscode.commands.executeCommand('cgware-vscode-cmake.refresh');
	});

	function parse_cmake(subdir: string | undefined, cmake: CMake): CMake {
		let file_path = path.join(cmake.root_path, ...(subdir ? [subdir] : []), 'CMakeLists.txt');

		if (!existsSync(file_path)) {
			return cmake;
		}

		cmake.files.push(file_path);

		const file = readFileSync(file_path, 'utf8');
		const cmds: Array<{ cmd: string; args: string[] }> = [];

		const reg = /^\s*(\w+)\s*\(([^)]*)\)\s*$/gm;
		let match;

		while ((match = reg.exec(file)) !== null) {
			const cmd = match[1];
			const args = match[2]
				.split(/\s+/)
				.filter(arg => arg.length > 0);
			cmds.push({ cmd, args });
		}

		cmds.forEach(cmd => {
			switch (cmd.cmd) {
				case 'add_executable': {
					cmake.targets.push(...[
						new CMakeBuildTarget(cmd.args[0]),
						new CMakeRunTarget(cmd.args[0], path.join(cmake.build_path, ...(subdir ? [subdir] : []), cmd.args[0])),
					]);
					break;
				}
				case 'add_library': {
					cmake.targets.push(new CMakeBuildTarget(cmd.args[0]));
					break;
				}
				case 'add_subdirectory': {
					parse_cmake(path.join(...(subdir ? [subdir] : []), cmd.args[0]), cmake);
					break;
				}
				default: {
					break;
				}
			}
		});

		return cmake;
	}

	function cmake_refresh() {
		cmake = parse_cmake(undefined, new CMake(wf));
		if (cmake.targets.length > 0) {
			last_target = cmake.targets.at(0);
		}
		projectProvider.setCMake(cmake);
	}

	context.subscriptions.push(...[
		vscode.commands.registerCommand('cgware-vscode-cmake.refresh', _ => cmake_refresh()),
		vscode.commands.registerCommand('cgware-vscode-cmake.config', _ => cmake.config(terminal)),
		vscode.commands.registerCommand('cgware-vscode-cmake.build', (target: CMakeTarget) => {
			target.launch(cmake, terminal);
			last_target = target;
		}),
		vscode.commands.registerCommand('cgware-vscode-cmake.run', (target: CMakeTarget) => {
			target.launch(cmake, terminal);
			last_target = target;
		}),
		vscode.commands.registerCommand('cgware-vscode-cmake.launch', _ => {
			if (!last_target) {
				vscode.window.showErrorMessage('No target selected');
				return;
			}

			last_target.launch(cmake, terminal);
		}),
	]);

	vscode.window.registerTreeDataProvider('cgware-vscode-cmake.project', projectProvider);
}

export function deactivate() { }
