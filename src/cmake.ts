import { join } from 'path';
import { debug } from "vscode";
import { existsSync } from 'fs';
import { Terminal } from "./terminal";

export enum CMakeTargetType {
	BUILD,
	RUN,
}

export enum CMakeConfig {
	DEBUG,
	RELEASE,
}

export const configs: { [key in CMakeConfig]: string } = {
	[CMakeConfig.DEBUG]: 'Debug',
	[CMakeConfig.RELEASE]: 'Release',
};

export abstract class CMakeTarget {
	public name: string;
	public type: CMakeTargetType;
	public outDir: string[] = new Array(Object.keys(CMakeConfig).length);
	public outName: string | undefined;

	protected constructor(name: string, type: CMakeTargetType) {
		this.name = name;
		this.type = type;
	}

	protected build(cmake: CMake, terminal: Terminal, config: CMakeConfig): Promise<void> {
		return cmake.build(terminal, this.name, config);
	}

	abstract launch(cmake: CMake, terminal: Terminal, config: CMakeConfig, dbg: string): Promise<void>;

	equals(other: CMakeTarget | undefined) {
		return other && this.name === other.name && this.type === other.type;
	}
}

export class CMakeBuildTarget extends CMakeTarget {
	constructor(name: string) {
		super(name, CMakeTargetType.BUILD);
	}

	launch(cmake: CMake, terminal: Terminal, config: CMakeConfig): Promise<void> {
		return this.build(cmake, terminal, config);
	}
}

export class CMakeRunTarget extends CMakeTarget {
	constructor(name: string, outDir: string, outName: string) {
		super(name, CMakeTargetType.RUN);
		this.outDir.fill(outDir);
		this.outName = outName;
	}

	run(cmake: CMake, terminal: Terminal, config: CMakeConfig, dbg: string): Promise<void> {
		return new Promise(async (resolve, reject) => {
			try {
				await this.build(cmake, terminal, config);
				await cmake.run(terminal, this, config, dbg);
				resolve();
			} catch (err) {
				reject(err);
			}
		});
	}

	launch(cmake: CMake, terminal: Terminal, config: CMakeConfig, dbg: string): Promise<void> {
		return this.run(cmake, terminal, config, dbg);
	}
}

export class CMake {
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
		this.buildDir = join(rootDir, 'build');
	}

	generate(terminal: Terminal, config: CMakeConfig): Promise<void> {
		return terminal.exec('cmake -S ' + this.srcDir + ' -B ' + this.buildDir + ' -DCMAKE_BUILD_TYPE=' + configs[config]);
	}

	build(terminal: Terminal, target: string, config: CMakeConfig): Promise<void> {
		return new Promise(async (resolve, reject) => {
			try {
				if (!existsSync(this.buildDir)) {
					await this.generate(terminal, config);
				}

				await terminal.exec('cmake --build ' + this.buildDir + ' --target ' + target + ' --config ' + configs[config]);
				resolve();
			} catch (err) {
				reject(err);
			}
		});
	}

	run(terminal: Terminal, target: CMakeRunTarget, config: CMakeConfig, dbg: string): Promise<void> {
		return new Promise(async (resolve, reject) => {
			if (!target.outDir || !target.outName) {
				return reject(new Error('No output file'));
			}

			let cmd = join(target.outDir[config], target.outName);
			cmd = cmd.replaceAll('${CMAKE_SOURCE_DIR}', this.srcDir);

			try {
				switch (config) {
					case CMakeConfig.DEBUG: {
						debug.startDebugging(undefined, {
							"type": dbg,
							"name": "GDB",
							"request": "launch",
							"program": cmd,
							"stopAtEntry": false,
							"externalConsole": false,
							"cwd": this.buildDir
						});
						break;
					}
					case CMakeConfig.RELEASE: {
						await terminal.exec(cmd);
						break;
					}
					default: {
						break;
					}
				}
				resolve();
			} catch (err) {
				reject(err);
			}
		});
	}
}
