import { TSpec } from './repository-specs-reader';
import { readFile as formerReadFile, writeFile as formerWriteFile, unlink as formerUnlink } from "fs";
import { join, dirname } from "path";
import { promisify } from "util";
import { hashElement } from "folder-hash";
import { Logger } from './logger';
import { TraversalType, DepthFirstSearch } from 'ajlm.utils';
import { TreeExecutor, TExecutionOptions } from './tree-executor';
import { Configuration } from './configuration';

let readFile = promisify(formerReadFile);
let writeFile = promisify(formerWriteFile);
let unlink = promisify(formerUnlink);

/**
 * Class used to execute a build action against a dependencies tree.
 * It adds a hash file to each package to know which one has not changed
 * avoiding a re compilation
 */
export class TreeBuilder extends TreeExecutor {


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
                Logger.info(`${node.name} up to date`, { color: "whiteBright"});
                return;
            }
        }
        
        try{
            // if forced or code changed, compile
            await this.compile(node);

            // update hash
            await this.writeHash(node);

            // force dependants to be rebuilt
            await this.forceNodeDependants(node);
        }
        catch(e){
            // erase hash for this node to allow re build
            await this.eraseHash(node);
        }
        
    }

    /**
     * Compilation command
     */
    private async compile(node: TSpec): Promise<void>{
        
        let script: string = <string>Configuration.getInstance().get("build.script"),
            command: string = `npm run ${script} --silent`;

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
            hashFileName: string = <string>Configuration.getInstance().get("build.hash.hashFileName"),
            hashFilePath: string = join( dirname(node.path), "/", hashFileName);

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
        let currentHash = await this.hashNode(node),
            hashFileName: string = <string>Configuration.getInstance().get("build.hash.hashFileName");

        await writeFile(join(dirname(node.path), "/", hashFileName), 
                        JSON.stringify( { hash: currentHash }));
    }

    /**
     * Erases node hash
     */
    private async eraseHash(node: TSpec): Promise<void> {
        let hashFileName: string = <string>Configuration.getInstance().get("build.hash.hashFileName"),
            pathToHashFile: string = join(dirname(node.path), "/", hashFileName);

        await unlink(pathToHashFile);
    }

    /**
     * Returns the hash of a node
     */
    private async hashNode(node: TSpec): Promise<string> {
        let hash = await hashElement(dirname(node.path), {
            folders: { 
                exclude: <string[]>Configuration.getInstance().get("build.hash.excludedFolders")
            },
            files: {
                exclude: <string[]>Configuration.getInstance().get("build.hash.excludedFiles")
            }
        });

        return hash.hash;
    }

    /**
     * Flags all node dependants as forced to be rebuilt.
     */
    private async forceNodeDependants(rootNode: TSpec): Promise<void> {
        
        if(Configuration.getInstance().get("build.forceDependantsRebuildOnChange") === false){
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