import { RepositorySpecsReader, TSpec } from './repository-specs-reader';
import { TreeExecutor } from './tree-executor';
import { readFile as formerReadFile, writeFile as formerWriteFile, write } from "fs";
import { resolve, join, dirname } from "path";
import { promisify } from "util";
import { hashElement } from "folder-hash";
import { Logger } from './logger';
import { exec } from 'child_process';
import { MapBasedDepthFirstSearch, TreeTraversalType } from 'ajlm.utils';

let readFile = promisify(formerReadFile);
let writeFile = promisify(formerWriteFile);

/**
 * Class used to execute a build action against a dependencies tree
 */
export class TreeBuilder {

    /**
     * @TODO put this into a config file and allow a workspace configuration file
     */
    private static readonly HASH_FILE_NAME: string = ".hash";
    private static readonly EXCLUDED_FOLDERS_FROM_HASH: string[] = ['.*', 'node_modules', "dist", "lib"];
    private static readonly EXCLUDED_FILES_FROM_HASH: string[] = [".*"];
    private static readonly BUILD_CMD: string = "npm run build";

    /**
     * Specs Reader
     */
    private rsr: RepositorySpecsReader = new RepositorySpecsReader();
    
    /**
     * Executor of action against a tree
     */
    private treeExecutor: TreeExecutor = new TreeExecutor();

    /**
     * In case of a recompiled node, flags all dependants as to recompile
     * and ignore the unchanged hash
     */
    private forcedNodes: { [name: string]: TSpec; } = {};
    
    /**
     * Executes a build action against each node starting from the leaves.
     * 
     */
    public async build(packageJson: string): Promise<void>{

        let specs: TSpec = await this.rsr.getPackageCompilationSpec(resolve(packageJson));

        this.forcedNodes = {};

        await this.treeExecutor.executeAction(specs, this.compilationCallback.bind(this));

    }

    /**
     * Callback used by the DFS algorithm to compile a node.
     * A node is recompiled in two cases:
     *  - the hash has changed (somebody changed a file)
     *  - a dependencies has been rebuilt forcing all its dependants to be recompiled
     */
    private async compilationCallback(node: TSpec) : Promise<void> {

        // check the node is not flagged as to be rebuilt
        if(!this.forcedNodes[node.name]){

            // if not, check code has not changed
            let areHashesEqual: boolean = await this.areHashesEqual(node);

            if(areHashesEqual){
                Logger.log(`${node.name} already compiled`);
                return;
            }
        }
        
        // if forced or code changed, compile
        await this.compile(node);

        // update hash
        await this.writeHash(node);

        // force dependants to be rebuilt
        await this.forceNodeDependants(node);
    }

    /**
     * Compilation command
     */
    private async compile(node: TSpec): Promise<void>{
        
        let command: string = TreeBuilder.BUILD_CMD;

        return new Promise<void>((resolve, reject)=>{

            Logger.log(`--->  Executing ${command} on ${node.name}`);

            let childStart: number = Date.now();
            var child = exec(command, {
                cwd: dirname(node.path)
            });
            child.stdout.on('data', function(data) {
                Logger.log(data);
            });
            child.stderr.on('data', function(data) {
                Logger.error(data);
            });
            child.on('close', function(code) {
                // Depending on code ... reject or resolve and display info
                Logger.log(`<---  End of ${command} on ${node.name}, code : ${code} / ${Date.now() - childStart} ms`);
                
                resolve();
                
            });
        });
    }


    /**
     * Hashes comparator.
     * Loads the hash file and compare the value against the new hashed value of the node
     * folder.
     */
    private async areHashesEqual(node: TSpec): Promise<boolean> {

        let hashFile: string,
            hash: string,
            hashFilePath: string = join( dirname(node.path), "/", TreeBuilder.HASH_FILE_NAME);

        try {
            
            hashFile = await readFile( hashFilePath, { encoding: "utf8"});
            hash = JSON.parse(hashFile).hash;

        } catch(e){
            hash = null;
        }

        let currentHash = await this.hashNode(node);

        return currentHash == hash;
    }

    /**
     * Updates hash file
     */
    private async writeHash(node: TSpec): Promise<void>{
        let currentHash = await this.hashNode(node);

        await writeFile(join(dirname(node.path), "/", TreeBuilder.HASH_FILE_NAME), 
                        JSON.stringify( { hash: currentHash }));
    }

    /**
     * Returns the hash of a node
     */
    private async hashNode(node: TSpec): Promise<string> {
        let hash = await hashElement(dirname(node.path), {
            folders: { 
                exclude: TreeBuilder.EXCLUDED_FOLDERS_FROM_HASH
            },
            files: {
                exclude: TreeBuilder.EXCLUDED_FILES_FROM_HASH
            }
        });

        return hash.hash;
    }

    /**
     * Flags all node dependants as forced to be rebuilt.
     */
    private async forceNodeDependants(rootNode: TSpec): Promise<void>{
        var dfs = new MapBasedDepthFirstSearch<TSpec>(async (node: TSpec)=>{
            return Object.keys(node.dependants).map(d => node.dependants[d]);
        }, async (node: TSpec)=>{
            return node.name;
        });

        await dfs.perform(rootNode, async (node: TSpec, parent: TSpec)=>{
            
            if(node.name == rootNode.name){
                return;
            }
            
            this.forcedNodes[ node.name ] = node;
        }, TreeTraversalType.PostOrder);
    }
}