
import { readFile as formerReadFile, stat as formerStat } from "fs";
import { promisify } from "util";
import { dirname, resolve, normalize, join } from "path";
import * as glob from "glob";

import { TraversalType, DepthFirstSearch, DfsTraversalError, DfsTraversalErrorType } from "ajlm.utils";
import { Logger } from './logger';

// Promisify nodejs methods
let readFile = promisify(formerReadFile);
let stat = promisify(formerStat);

// Define a map
type ObjectLiteral = { [key: string]: any; };

// Define a spec
export type TSpec = {
    name: string;                                       // name of package
    path: string;                                       // path to package.json file
    pkg: ObjectLiteral;                                 // package.json file content, parsed
    dependencies: { [pkgName: string]: TSpec };         // dependencies
    dependants: { [pkgName: string]: TSpec };           // dependants
    isVirtual?: boolean;                                // true if this node has no package.json
};

// Define a repository
export type TRepositorySpecs = {
    packagesMap: { [pkgName: string]: TSpec; };         // all packages of repo
    rootTrees: TSpec[];                                 // all packages of repo that have no dependants
};

/**
 * Class in charge of reading specifications (package.json)
 * and their relations (dependencies, dependants) of a specific package
 * or an entire repository.
 * 
 * This allows to build a Tree structure representing the dependencies and to make
 * the base structure to execute operations on a package or a repo.
 * 
 */
export class RepositorySpecsReader {

    // handler for building relations between specs
    private readonly buildParentDependantsTree: (node: TSpec, parent: TSpec) => Promise<void> 
    = async (node: TSpec, parent: TSpec) => {
        if(!parent){
            return;
        }

        if(!node.dependants[ parent.name ]) {
            node.dependants[ parent.name ] = parent;
        }

        if(!parent.dependencies[ node.name ]){
            parent.dependencies[ node.name ] = node;
        }
    };

    /**
     * Retrieves all specs from all packages in a mono repository
     */
    public async getRepositoryPackages(repositoryPackageJsonPath: string): Promise<TRepositorySpecs> {
        
        let pkgFiles: string[] = await this.getRepoPackagesFilesList(repositoryPackageJsonPath);

        let result = await this.getAllSpecs(pkgFiles);
        return result;
    }

    /**
     * Retrieves spec from a package in a mono repository
     */
    public async getPackageCompilationSpec(packagePath: string): Promise<TSpec>{

        let readPackage = async (file: string): Promise<ObjectLiteral> => {
                let pckContent: string = await readFile(file, { encoding: 'utf8'}),
                    pck = JSON.parse(pckContent);
                return pck;
            },
            repoPath: string = await this.findRepositoryPackagesDirectory(packagePath),
            readPackages: ObjectLiteral = { };

        // read the package file
        let pck = await readPackage(packagePath);

        // init result for DFS algorithm
        let result: TSpec = {
                name: pck.name,
                path: packagePath,
                pkg: pck,
                dependants: {},
                dependencies: {}
            };
       
        readPackages[ pck.name ] = result;

        // using a DFS to map relations
        let dfs = new DepthFirstSearch<TSpec>( 
            { 
                getNodeHash: async (node: TSpec) => { return node.name; },
                adjacentNodeGetter: async (node: TSpec) => {
                    let nodes = [];
                    await this.browsePackageDependencies(node.pkg, async (dep: string, version: string) => {
                        let spec: TSpec,
                                depFolder = dep;
            
                            // avoid re reading files twice
                            spec = readPackages[dep];
            
                            if(!spec) {
            
                                let filePath = join(repoPath,"/", depFolder, "/package.json");
            
                                try{
                                    await stat(filePath);
                                }catch(e){
                                    
                                    return;
                                }
                                
                                let filePck = await readPackage( filePath );
                                spec = {
                                    name: filePck.name,
                                    pkg: filePck,
                                    path: filePath,
                                    dependants: {},
                                    dependencies: {}
                                };
                                readPackages[ spec.name ] = spec;
                            }
                            
                            nodes.push(spec);
                    });

                    return nodes;
                },
                processNode: async (node: TSpec)=>{
                    // nothing ...
                },
                processEdge: async (parent: TSpec, child: TSpec)=>{
                    await this.buildParentDependantsTree(child, parent);
                }
            }, true);

        try {
            // trigger traversal
            await dfs.perform(result, TraversalType.PostOrder);
        }
        catch(e) {
            
            if( (e instanceof DfsTraversalError) && (<DfsTraversalError<TSpec[]>>e).type == DfsTraversalErrorType.Cycle) {
                // Cycle detected
                Logger.error(`Cycle Detected in dependencies ${(<DfsTraversalError<TSpec[]>>e).data.map(d => d.name).join(' -> ')}`);
            }

            throw e;
        }
        
        return result;
    }

    /**
     * Triggers a reading process of all package.json files and loads their relations
     */
    private async getAllSpecs(files: string[]): Promise<TRepositorySpecs> {
        let results: TRepositorySpecs = {
            packagesMap: {},
            rootTrees: []
        };

        // read all packages
        await Promise.all( 
            files.map((file)=>{
                
                return readFile(file, { encoding: 'utf8'})
                .then((fileContent: string)=>{
                    let pckg = JSON.parse(fileContent);

                    let pck: TSpec = {
                        name: pckg.name,
                        pkg: pckg,
                        path: file,
                        dependants: {},
                        dependencies: {}
                    };

                    results.packagesMap[pck.name] = pck;
                });
            })
         );
         
         // loads relation with a DFS
         let dfs = new DepthFirstSearch<TSpec>( 
             {
                 getNodeHash: async (node: TSpec) => { return node.name; },
                 adjacentNodeGetter: async (node: TSpec) => {
                    let nodes = [];

                    await this.browsePackageDependencies(node.pkg, async (dep: string, version: string)=>{
                        if(!results.packagesMap[ dep ]){
                            return;
                        }

                        nodes.push(results.packagesMap[ dep ]);
                    });

                    return nodes;
                },
                processNode: async (node: TSpec) => {
                    // nothing
                },
                processEdge: async (parent: TSpec, child: TSpec) => {
                    await this.buildParentDependantsTree(child, parent);
                }
            }, true
        );


         // create relationships in the trees
         for(var k in results.packagesMap) {
            
            try {
                // trigger traversal
                await dfs.perform(results.packagesMap[k], TraversalType.PostOrder);
            }
            catch(e) {
                
                if( (e instanceof DfsTraversalError) && (<DfsTraversalError<TSpec[]>>e).type == DfsTraversalErrorType.Cycle) {
                    // Cycle detected
                    Logger.error(`Cycle Detected in dependencies ${(<DfsTraversalError<TSpec[]>>e).data.map(d => d.name).join(' -> ')}`);
                }
    
                throw e;
            }
         }

         // determine root packages (those with no dependants)
         for(var k in results.packagesMap) {
             if( !Object.keys( results.packagesMap[ k ].dependants ).length ){
                 results.rootTrees.push(results.packagesMap[ k ]);
             }
         }
         

         return results;
    }


    /**
     * Retrives all package files from a repository.
     * 
     * It tries to read the json file of the repository and find out where the packages are
     * before globbing them.
     */
    private async getRepoPackagesFilesList(packageJsonRepoPath: string): Promise<string[]> {
        
        packageJsonRepoPath = resolve(packageJsonRepoPath);

        let packageContent: string = await readFile(resolve(packageJsonRepoPath), "utf8"),
            pkg: ObjectLiteral = JSON.parse(packageContent);

        let packageEntries: string[] = pkg.workspaces.packages;

        let results: string[] = [];
        await Promise.all(packageEntries.map((entry)=>{
            return this.globPackages( dirname(packageJsonRepoPath), `${entry}/**/package.json`)
            .then((rs: string[])=>{
                results.push.apply(results, rs);
            });
        }));
        
        return results;
    }

    /**
     * Globs package.json files from mono repo packages path.
     */
    private globPackages(packagePath: string, entry: string): Promise<string[]>{
        return new Promise<string[]>((resolve, reject)=>{
           
           
           if(entry.indexOf("./") == 0 || entry.indexOf(".\\") == 0){
               // if a path starts with a dot, it ignores the "ignore"
               // entry (node modules and co ...)
               // see bug https://github.com/isaacs/node-glob/issues/309
               entry = entry.substring(2);
           }

            glob(entry, {
                cwd: packagePath,
                absolute: true,
                stat: false,
                ignore: [
                    // @todo make this customizable ?
                    "**/node_modules/**",
                    "**/dist/**",
                    "**/bin/**",
                    "**/lib/**",
                    "**/bundle/**",
                    "**/logs/**",
                    "**/cfg/**"
                ]
            }, (err, files)=>{
                if(err){
                    reject(err);
                } else {
                    resolve(files);
                }
            });
        });
    }

    /**
     * Browses a package dependencies (devDependencie and dependencies)
     */
    private async browsePackageDependencies(pkg: ObjectLiteral, cb: (depName: string, version: string) => Promise<void>): Promise<void> {
        let pckKeys: string[] = ["dependencies", "devDependencies"];

        for(var i = 0;i < pckKeys.length; i++){
            
            if(!pkg[pckKeys[i]]) { 
                continue; 
            }

            for(var dep in pkg[pckKeys[i]]) {
                await cb(dep, pkg[pckKeys[i]][dep]);
            }
        }
    }

    /**
     * Tries to find out the repo packages folder file from a sub package file
     */
    private async findRepositoryPackagesDirectory(subPackagePath: string): Promise<string>{
        
        let previousPath: string = subPackagePath,
            pathToPackage: string = normalize(`${ dirname(subPackagePath) }/../package.json`);

        do {
            
            try {
                let fileContent: string = await readFile(pathToPackage, "utf8");
                let pkg = JSON.parse(fileContent);
    
                if(pkg.workspaces != undefined){
                    // we are in a yarn package
                    // return workspace packages directory
                    return dirname(previousPath);
                }
                else {
                    // found a not related package file
                    // throw error to pass in the following catch
                    throw new Error("Not Related");
                }
            } catch(e){
                previousPath = pathToPackage;
                pathToPackage = normalize(`${dirname(pathToPackage)}/../package.json`);
            }
        }
        while(previousPath != pathToPackage);
        
        throw new Error("Workspace not found");
    }
}