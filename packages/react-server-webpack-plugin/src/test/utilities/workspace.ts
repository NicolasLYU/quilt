import * as path from 'path';

import * as fs from 'fs-extra';
import webpack, {Compiler} from 'webpack';

export class Workspace {
  constructor(public readonly root: string) {}

  resolvePath(...parts: string[]) {
    return path.resolve(this.root, ...parts);
  }

  buildPath(...parts: string[]) {
    return this.resolvePath('build', ...parts);
  }

  async write(file: string, contents: string) {
    const filePath = this.resolvePath(file);
    await fs.mkdirp(path.dirname(filePath));
    await fs.writeFile(filePath, contents, {encoding: 'utf8'});
  }

  async cleanup() {
    await fs.emptyDir(this.root);
    await fs.remove(this.root);
  }
}

export async function createWorkspace({
  name,
  rootFixtureDirectory = path.resolve(__dirname, '../fixtures'),
}: {
  name: string;
  rootFixtureDirectory?: string;
}) {
  const fixtureDirectory = path.join(rootFixtureDirectory, name);
  await fs.mkdirp(fixtureDirectory);
  await fs.writeFile(path.join(fixtureDirectory, '.gitignore'), '*');
  return new Workspace(fixtureDirectory);
}

export async function withWorkspace(
  name: string,
  runner: (context: {workspace: Workspace; build: () => Promise<any[]>}) => any,
) {
  const workspace = await createWorkspace({name});
  const build = () => runWebpack(name);

  try {
    await runner({workspace, build});
  } finally {
    await workspace.cleanup();
  }
}

export function runWebpack(configPath: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const pathFromRoot = path.resolve(
      './packages/react-server-webpack-plugin/src/test/fixtures',
      configPath,
    );

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const config = require(`${pathFromRoot}/webpack.config.js`);
    const contextConfig = Array.isArray(config)
      ? config.map(config => ({
          ...config,
          context: pathFromRoot,
        }))
      : {
          ...config,
          context: pathFromRoot,
        };

    // We use MemoryOutputFileSystem to prevent webpack from outputting to our actual FS
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const MemoryOutputFileSystem = require('webpack/lib/MemoryOutputFileSystem');

    const compiler: Compiler = webpack(contextConfig);
    compiler.outputFileSystem = new MemoryOutputFileSystem({});

    compiler.run((err, stats) => {
      if (err) {
        reject(err);
        return;
      }

      if (stats.hasErrors()) {
        reject(stats.toString());
        return;
      }

      const statsObject = stats.toJson();
      resolve(statsObject.children);
    });
  });
}

export function getModule(results: any, basePath: string) {
  const newResults = results.modules.find(
    ({name}) =>
      name.includes(`./${basePath}.js`) ||
      name.includes(`./${basePath}/index.js`),
  );

  if (newResults.source) {
    return newResults;
  }

  return getModule(newResults, basePath);
}
