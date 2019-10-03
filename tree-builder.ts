import { TSpec } from './repository-specs-reader';
import { readFile as formerReadFile, writeFile as formerWriteFile } from "fs";
import { join, dirname } from "path";
import { promisify } from "util";
import { hashElement } from "folder-hash";
import { Logger } from './logger';
import { TraversalType, DepthFirstSearch } from 'ajlm.utils';
import { TreeExecutor, TExecutionOptions } from './tree-executor';

let readFile = promisify(formerReadFile);
let writeFile = promisify(formerWriteFile);

/**
 * Class used to execute a build action against a dependencies tree.
 * It adds a hash file to each package to know which one has not changed
 * avoiding a re compilation
 */
export class TreeBuilder extends TreeExecutor {

    /**
     * @TODO put this into a config file and allow a workspace configuration file
     *      IDEA: put the conf into package.json, and read it as a project basis.
     *              if not found take those defaults
     *      Exclude hash file name from this
     */
    private static readonly HASH_FILE_NAME: string = ".hash";
    private static readonly EXCLUDED_FOLDERS_FROM_HASH: string[] = ['.*', 'node_modules', "dist", "lib", "bundle", "logs"];
    private static readonly EXCLUDED_FILES_FROM_HASH: string[] = [".*"];
    private static readonly NPM_BUILD_SCRIPT: string = "build";
    private static readonly FORCE_DEPENDANTS_ON_CHANGE: boolean = true;
    
    /**
     * In case of a recompiled node, flags all dependants as to recompile
     * and ignore the unchanged hash
     */
    private forcedNodes: { [name: string]: TSpec; } = {};

    /**
     * Force all actions against node, regardless of their compilation state
     */
    private forceAll: boolean = false;
    
    /**
     * Executes a build action against each node starting from the leaves.
     * 
     */
    public async buildPackage(packageJson: string | TSpec, options: TExecutionOptions): Promise<void>{
        
        this.forcedNodes = {};
        await this.execCmdOnPackage(packageJson, this.compilationCallback.bind(this), options);

    }

    /**
     * Builds an entire repository
     */
    public async buildRepository(repoPath: string, options: TExecutionOptions): Promise<void> {

        this.forceAll = options.forceAll === true;
        this.forcedNodes = {};
        await this.execCmdOnRepository(repoPath, this.compilationCallback.bind(this), options);

    }

    /**
     * Callback used by the DFS algorithm to compile a node.
     * A node is recompiled in two cases:
     *  - the hash has changed (somebody changed a file)
     *  - a dependencies has been rebuilt forcing all its dependants to be recompiled
     */
    private async compilationCallback(node: TSpec) : Promise<void> {

        // check the node is not flagged as to be rebuilt
        if(!this.forcedNodes[node.name] && !this.forceAll){

            // if not, check code has not changed
            let areHashesEqual: boolean = await this.areHashesEqual(node);

            if(areHashesEqual){
                Logger.info(`${node.name} already compiled`, { color: "whiteBright"});
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
        
        let script: string = TreeBuilder.NPM_BUILD_SCRIPT,
            command: string = `npm run ${script}`;

        // check that, in case of npm script, it exists
        // in pkg
        
        if(!node.pkg.scripts){
            // no scripts tag in package
            Logger.info(`No scripts entry in ${node.name}, Skipping`);
            return;
        }
        
        if(!node.pkg.scripts[script]){
            Logger.info(`Script ${script} not available in ${node.name}, skipping`);
            // script not present in package
            return;
        }

        await this.execCmd(node, command);
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
    private async forceNodeDependants(rootNode: TSpec): Promise<void> {
        
        if(!TreeBuilder.FORCE_DEPENDANTS_ON_CHANGE){
            return;
        }

        let dfs = new DepthFirstSearch<TSpec>({
            getNodeHash: this.nodeHasher,
            adjacentNodeGetter: this.dependantsRetriever,
            processNode: async (node: TSpec) => {
                if(node.name == rootNode.name){
                    return;
                }
                
                this.forcedNodes[ node.name ] = node;
            }
        });

        await dfs.perform(rootNode, TraversalType.PostOrder);
    }
}