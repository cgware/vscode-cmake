import { Event, EventEmitter, TreeDataProvider, TreeItem, TreeItemCollapsibleState } from 'vscode';
import { CMake, CMakeConfig, CMakeTarget, CMakeTargetType, configs } from './cmake';

abstract class ProjectItem extends TreeItem {
	abstract getChildren(): ProjectItem[];
}

class LaunchItem extends ProjectItem {
	protected constructor(target: CMakeTarget, selected: CMakeTarget | undefined) {
		super(target.name + (target === selected ? ' (selected)' : ''), TreeItemCollapsibleState.None);
	}

	getChildren(): ProjectItem[] {
		return [];
	}
}

class BuildItem extends LaunchItem {
	constructor(target: CMakeTarget, selected: CMakeTarget | undefined) {
		super(target, selected);
		this.command = {
			command: 'cgware-vscode-cmake.build',
			title: 'Build ' + target.name,
			arguments: [target]
		};
	}
}

class RunItem extends LaunchItem {
	constructor(target: CMakeTarget, selected: CMakeTarget | undefined) {
		super(target, selected);
		this.command = {
			command: 'cgware-vscode-cmake.run',
			title: 'Run ' + target.name,
			arguments: [target]
		};
	}
}

abstract class LaunchItems extends ProjectItem {
	protected cmake: CMake;
	protected type: CMakeTargetType;
	protected selected: CMakeTarget | undefined;

	protected constructor(cmake: CMake, type: CMakeTargetType, name: string, selected: CMakeTarget | undefined) {
		super(name, TreeItemCollapsibleState.Expanded);
		this.cmake = cmake;
		this.type = type;
		this.selected = selected;
	}
}

class BuildItems extends LaunchItems {
	constructor(cmake: CMake, selected: CMakeTarget | undefined) {
		super(cmake, CMakeTargetType.BUILD, 'Build', selected);
	}

	getChildren(): ProjectItem[] {
		return this.cmake.targets.filter(target => target.type === this.type).map(target => new BuildItem(target, this.selected));
	}
}

class RunItems extends LaunchItems {
	constructor(cmake: CMake, selected: CMakeTarget | undefined) {
		super(cmake, CMakeTargetType.RUN, "Run", selected);
	}

	getChildren(): ProjectItem[] {
		return this.cmake.targets.filter(target => target.type === this.type).map(target => new RunItem(target, this.selected));
	}
}

class ConfigItem extends ProjectItem {
	constructor(config: CMakeConfig, selected: CMakeConfig) {
		super(configs[config] + (config === selected ? ' (selected)' : ''), TreeItemCollapsibleState.None);
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

class ConfigItems extends ProjectItem {
	private selected: CMakeConfig;

	constructor(selected: CMakeConfig) {
		super('Config', TreeItemCollapsibleState.Expanded);
		this.selected = selected;
	}

	getChildren(): ProjectItem[] {
		return Object.values(CMakeConfig)
			.filter((config, _) => typeof config === 'string')
			.map((_, config) => new ConfigItem(config, this.selected));
	}
}

export class ProjectProvider implements TreeDataProvider<ProjectItem> {
	private _onDidChangeTreeData: EventEmitter<ProjectItem | undefined | void> = new EventEmitter<ProjectItem | undefined | void>();
	readonly onDidChangeTreeData: Event<ProjectItem | undefined | void> = this._onDidChangeTreeData.event;
	private cmake: CMake;
	public target: CMakeTarget | undefined;
	public config: CMakeConfig;

	constructor(cmake: CMake) {
		this.cmake = cmake;
		this.target = this.cmake.targets.find((item: CMakeTarget) => item.equals(this.target)) || this.cmake.targets.at(0);
		this.config = CMakeConfig.DEBUG;
	}

	getTreeItem(element: ProjectItem): TreeItem {
		return element;
	}

	getChildren(element?: ProjectItem): ProjectItem[] {
		if (!element) {
			return [
				new BuildItems(this.cmake, this.target),
				new RunItems(this.cmake, this.target),
				new ConfigItems(this.config),
			];
		}

		return element.getChildren();
	}

	setCMake(cmake: CMake) {
		this.cmake = cmake;
		this.target = this.cmake.targets.find((item: CMakeTarget) => item.equals(this.target)) || this.cmake.targets.at(0);
		this._onDidChangeTreeData.fire();
	}

	setConfig(config: CMakeConfig) {
		this.config = config;
		this._onDidChangeTreeData.fire();
	}

	setTarget(target: CMakeTarget) {
		this.target = target;
		this._onDidChangeTreeData.fire();
	}
}