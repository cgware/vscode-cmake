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

enum CMakeConfig {
	DEBUG,
	RELEASE,
}

const configs: {[key in CMakeConfig]: string} = {
	[CMakeConfig.DEBUG]: 'Debug',
	[CMakeConfig.RELEASE]: 'Release',
};

abstract class CMakeTarget extends ProjectItem {
	public name: string;
	public type: CMakeTargetType;
	public outDir: string[] = new Array(Object.keys(CMakeConfig).length);
	public outName: string | undefined;

	protected constructor(name: string, type: CMakeTargetType) {
		super(name, vscode.TreeItemCollapsibleState.None);
		this.name = name;
		this.type = type;
	}

	getChildren(): ProjectItem[] {
		return [];
	}

	protected build(cmake: CMake, terminal: Terminal, config: CMakeConfig) {
		cmake.build(terminal, this.name, config);
	}

	abstract launch(cmake: CMake, terminal: Terminal, config: CMakeConfig): void;

	equals(other: CMakeTarget | undefined) {
		return other && this.name === other.name && this.type === other.type;
	}
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

	launch(cmake: CMake, terminal: Terminal, config: CMakeConfig) {
		this.build(cmake, terminal, config);
	}
}

class CMakeRunTarget extends CMakeTarget {
	constructor(name: string, outDir: string, outName: string) {
		super(name, CMakeTargetType.RUN);
		this.command = {
			command: 'cgware-vscode-cmake.run',
			title: 'Run ' + name,
			arguments: [this]
		};
		this.outDir.fill(outDir);
		this.outName = outName;
	}

	run(cmake: CMake, terminal: Terminal, config: CMakeConfig) {
		this.build(cmake, terminal, config);
		cmake.run(terminal, this, config);
	}

	launch(cmake: CMake, terminal: Terminal, config: CMakeConfig) {
		this.run(cmake, terminal, config);
	}
}

class CMake {
	public rootDir: string;
	public srcDir: string;
	public buildDir: string;
	public files: string[] = [];
	public targets: CMakeTarget[] = [
		new CMakeBuildTarget('all'),
		new CMakeBuildTarget('clean'),
	];

	constructor(rootDir: string) {
		this.rootDir = rootDir;
		this.srcDir = rootDir;
		this.buildDir = path.join(rootDir, 'build');
	}

	generate(terminal: Terminal) {
		terminal.exec('cmake -S ' + this.srcDir + ' -B ' + this.buildDir);
	}

	build(terminal: Terminal, target: string, config: CMakeConfig) {
		if (!existsSync(this.buildDir)) {
			this.generate(terminal);
		}

		terminal.exec('cmake --build ' + this.buildDir + ' --target ' + target + ' --config ' + configs[config]);
	}

	run(terminal: Terminal, target: CMakeRunTarget, config: CMakeConfig) {
		if (!target.outDir || !target.outName) {
			return;
		}

		let cmd = path.join(target.outDir[config], target.outName);
		cmd = cmd.replaceAll('${CMAKE_SOURCE_DIR}', this.srcDir);
		terminal.exec(cmd);
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

class ConfigItem extends ProjectItem {
	constructor(config: CMakeConfig) {
		super(configs[config], vscode.TreeItemCollapsibleState.None);
		this.command = {
			command: 'cgware-vscode-cmake.config',
			title: configs[config],
			arguments: [config]
		};
	}

	getChildren(): ProjectItem[] {
		return [];
	}
}

class ConfigsItem extends ProjectItem {
	constructor() {
		super('Config', vscode.TreeItemCollapsibleState.Expanded);
	}

	getChildren(): ProjectItem[] {
		return Object.values(CMakeConfig).map((_, config) => new ConfigItem(config));
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
				new ConfigsItem(),
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
	let lastTarget: CMakeTarget | undefined;
	let lastConfig = CMakeConfig.DEBUG;
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
		let file_path = path.join(cmake.rootDir, ...(subdir ? [subdir] : []), 'CMakeLists.txt');

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
						new CMakeRunTarget(cmd.args[0], path.join(cmake.buildDir, ...(subdir ? [subdir] : [])), cmd.args[0]),
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
				case 'set_target_properties': {
					let targets: CMakeTarget[] = [];
					let i = 0;
					while (i < cmd.args.length && cmd.args[i] !== 'PROPERTIES') {
						targets.push(...cmake.targets.filter((target: CMakeTarget) => target.name === cmd.args[i]));
						i++;
					}

					if (cmd.args[i++] !== 'PROPERTIES') {
						break;
					}

					while (i < cmd.args.length) {
						let prop = cmd.args[i++];
						let val = cmd.args[i++];

						switch (prop) {
							case 'RUNTIME_OUTPUT_DIRECTORY_DEBUG': {
								targets
									.filter(target => target.type === CMakeTargetType.RUN)
									.forEach((target: CMakeTarget) => target.outDir[CMakeConfig.DEBUG] = val);
								break;
							}
							case 'LIBRARY_OUTPUT_DIRECTORY_DEBUG': {
								targets
									.filter(target => target.type === CMakeTargetType.BUILD)
									.forEach((target: CMakeTarget) => target.outDir[CMakeConfig.DEBUG] = val);
								break;
							}
							case 'RUNTIME_OUTPUT_DIRECTORY_RELEASE': {
								targets
									.filter(target => target.type === CMakeTargetType.RUN)
									.forEach((target: CMakeTarget) => target.outDir[CMakeConfig.RELEASE] = val);
								break;
							}
							case 'LIBRARY_OUTPUT_DIRECTORY_RELEASE': {
								targets
									.filter(target => target.type === CMakeTargetType.BUILD)
									.forEach((target: CMakeTarget) => target.outDir[CMakeConfig.RELEASE] = val);
								break;
							}
							case 'OUTPUT_NAME': {
								targets.forEach((target: CMakeTarget) => target.outName = val);
								break;
							}
							default: {
								break;
							}
						}
					}
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
		projectProvider.setCMake(cmake);

		lastTarget = cmake.targets.find((item: CMakeTarget) => item.equals(lastTarget)) || cmake.targets.at(0);
	}

	context.subscriptions.push(...[
		vscode.commands.registerCommand('cgware-vscode-cmake.refresh', _ => cmake_refresh()),
		vscode.commands.registerCommand('cgware-vscode-cmake.generate', _ => cmake.generate(terminal)),
		vscode.commands.registerCommand('cgware-vscode-cmake.config', (config: CMakeConfig) => lastConfig = config),
		vscode.commands.registerCommand('cgware-vscode-cmake.build', (target: CMakeTarget) => {
			target.launch(cmake, terminal, lastConfig);
			lastTarget = target;
		}),
		vscode.commands.registerCommand('cgware-vscode-cmake.run', (target: CMakeTarget) => {
			target.launch(cmake, terminal, lastConfig);
			lastTarget = target;
		}),
		vscode.commands.registerCommand('cgware-vscode-cmake.launch', _ => {
			if (!lastTarget) {
				vscode.window.showErrorMessage('No target selected');
				return;
			}

			lastTarget.launch(cmake, terminal, lastConfig);
		}),
	]);

	vscode.window.registerTreeDataProvider('cgware-vscode-cmake.project', projectProvider);
}

export function deactivate() { }
