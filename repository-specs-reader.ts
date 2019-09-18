
import { readFile as formerReadFile, stat as formerStat } from "fs";
import { promisify } from "util";
import { normalize, basename, join } from "path";
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
    public async getRepositoryPackages(repositoryPath: string): Promise<TRepositorySpecs> {
        let pkgFiles: string[] = await this.getPackagesFilesList(repositoryPath);

        return this.getAllSpecs(pkgFiles);
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
            repoPath: string = normalize(`${packagePath}/../..`),
            readPackages: ObjectLiteral = {
                
            };
        
        if(basename(repoPath) == "@types"){
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

            for(var dep in node.pkg.dependencies){
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


    private getPackagesFilesList(repoPath: string): Promise<string[]> {
        
        return new Promise<string[]>((resolve, reject)=>{
            glob("**/**/package.json", {
                cwd: repoPath,
                absolute: true,
                ignore: [
                    "**/node_modules/**",
                    "**/dist/**",
                    "**/bin/**",
                    "**/lib/**"
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