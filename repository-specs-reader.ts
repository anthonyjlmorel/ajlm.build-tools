
import { readFile as formerReadFile, stat as formerStat } from "fs";
import { promisify } from "util";
import { dirname, resolve, normalize, basename, join } from "path";
import * as glob from "glob";

import { TreeTraversalType, MapBasedDepthFirstSearch } from "ajlm.utils";

let readFile = promisify(formerReadFile);
let stat = promisify(formerStat);

type ObjectLiteral = { [key: string]: any; };

export type TSpec = {
    name: string;
    path: string;
    pkg: ObjectLiteral; // package.json file
    dependencies: { [pkgName: string]: TSpec };
    dependants: { [pkgName: string]: TSpec };
};

export type TRepositorySpecs = {
    packagesMap: { [pkgName: string]: TSpec; };
    rootTrees: TSpec[];
};

export class RepositorySpecsReader {


    /**
     * Retrieves all specs from all packages in a mono repository
     */
    public async getRepositoryPackages(repositoryPackageJsonPath: string): Promise<TRepositorySpecs> {
        
        let pkgFiles: string[] = await this.getPackagesFilesList(repositoryPackageJsonPath);

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
            repoPath: string = normalize(`${packagePath}/../..`), // @TODO I am wondering if it is not a specificity ...
            readPackages: ObjectLiteral = {
                
            };
        
        if(basename(repoPath) == "@types"){
            // @TODO I am wondering if it is not a specificity ...
            repoPath = normalize(`${packagePath}/../../..`)
        }

        let pck = await readPackage(packagePath);

        let result: TSpec = {
                name: pck.name,
                path: packagePath,
                pkg: pck,
                dependants: {},
                dependencies: {}
            };
       
        readPackages[ pck.name ] = result;

        let dfs = new MapBasedDepthFirstSearch<TSpec>( async (node: TSpec) => {
            let nodes = [];

            let pckKeys: string[] = ["dependencies", "devDependencies"];

            for(var i = 0;i < pckKeys.length; i++){
                for(var dep in node.pkg[pckKeys[i]]) {
                    let spec: TSpec,
                        depFolder = dep;
    
                    // avoid re reading files twice
                    spec = readPackages[dep];
    
                    if(!spec) {
    
                        let filePath = join(repoPath,"/", depFolder, "/package.json");
    
                        try{
                            await stat(filePath);
                        }catch(e){
                            continue;
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
                }
            }
            

            return nodes;
        }, async (node: TSpec) => {
            return node.name;
        });

        await dfs.perform(result, async (node: TSpec, parent: TSpec) => {

            if(!parent){
                return;
            }

            if(!node.dependants[ parent.name ]) {
                node.dependants[ parent.name ] = parent;
            }

            if(!parent.dependencies[ node.name ]){
                parent.dependencies[ node.name ] = node;
            }

        }, TreeTraversalType.PostOrder);


        return result;
    }

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


         let dfs = new MapBasedDepthFirstSearch<TSpec>( async (node: TSpec) => {
             let nodes = [];

             
             if(!node.pkg.dependencies) { return nodes; }

             for(var dep in node.pkg.dependencies){

                 if(!results.packagesMap[ dep ]){
                     continue;
                 }

                 nodes.push(results.packagesMap[ dep ]);
             }

             return nodes;
         }, async (node: TSpec) => { return node.name; } );


         // create relationships in the trees
         for(var k in results.packagesMap) {
            await dfs.perform(results.packagesMap[k], async (node: TSpec, parent: TSpec)=>{
                if(!parent){
                    return;
                }
                if(!node.dependants[ parent.name ]) {
                    node.dependants[ parent.name ] = parent;
                }

                if(!parent.dependencies[ node.name ]){
                    parent.dependencies[ node.name ] = node;
                }

            }, TreeTraversalType.PostOrder);
         }

         for(var k in results.packagesMap) {
             if( !Object.keys( results.packagesMap[ k ].dependants ).length ){
                 results.rootTrees.push(results.packagesMap[ k ]);
             }
         }
         

         return results;
    }


    private async getPackagesFilesList(packageJsonRepoPath: string): Promise<string[]> {
        
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
                    /* "./node_modules/**",
                    "./dist/**",
                    "./bin/**",
                    "./lib/**",
                    "./bundle/**",
                    "./logs/**",
                    "./cfg/**",*/
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

}