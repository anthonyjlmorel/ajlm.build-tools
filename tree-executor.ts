import { TSpec, RepositorySpecsReader, TRepositorySpecs } from './repository-specs-reader';
import { BreadthFirstSearch, TraversalType, DepthFirstSearch } from 'ajlm.utils';
import { resolve, dirname } from 'path';
import { Logger } from './logger';
import { exec } from 'child_process';

// Define accepted options
export type TTreeExecOptions = {
    tree: {
        parallel?: boolean;
    }
};

export type TAllExecOptions = {
    all: {
        parallel?: boolean;
    }
};

// Cannot have All and Tree options at the same time
export type TExecutionOptions = { forceAll?:boolean; } & (TTreeExecOptions | TAllExecOptions);

/**
 * 
 * Defines executable actions against a dependencies Tree structure
 * 
 */
export class TreeExecutor {

    /**
     * Returns a node hash
     */
    protected nodeHasher: (node: TSpec) => Promise<string> = async (node: TSpec) => { return node.name; };

    /**
     * Returns a node dependencies
     */
    protected dependenciesRetriever: (node: TSpec) => Promise<TSpec[]> = async (node: TSpec) => {
        return Object.keys(node.dependencies).map(d => node.dependencies[d]);
    };

    /**
     * Returns a node dependants
     */
    protected dependantsRetriever: (node: TSpec) => Promise<TSpec[]> = async (node: TSpec) => {
        return Object.keys(node.dependants).map(d => node.dependants[d]);
    };

    /**
     * Specs Reader
     */
    protected rsr: RepositorySpecsReader = new RepositorySpecsReader();

    
    constructor( ) {
    }

    public async execCmdOnRepository(packageJson: string, 
                                    command: string | ((node: TSpec, index:number, collection: TSpec[]) => Promise<void>),
                                    options: TExecutionOptions): Promise<void> {
        let repo: TRepositorySpecs = await this.rsr.getRepositoryPackages(resolve(packageJson));

        // create a common root node to allow parallel compilation

        let rootNode: TSpec = {
            dependants: {},
            dependencies: {},
            name: `ROOT-${Date.now()}`,
            path: null,
            pkg: null,
            isVirtual: true
        };

        for(var i=0; i<repo.rootTrees.length; i++) {
            rootNode.dependencies[repo.rootTrees[i].name] = repo.rootTrees[i];
        }

        await this.triggerCommand(rootNode, command, options);

    }

    /**
     * Executes an action on each node following a DFS algorithm
     */
    public async execCmdOnPackage( packageJson: string | TSpec, 
                                  command: string | ((node: TSpec, index:number, collection: TSpec[]) => Promise<void>),
                                  options: TExecutionOptions ): Promise<void>{
        let specs: TSpec;
        
        if(typeof packageJson == "string"){
            specs = await this.rsr.getPackageCompilationSpec(resolve(<string>packageJson));
        } else {
            specs = <TSpec>packageJson;
        }
        
        await this.triggerCommand(specs, command, options);
    }

    /**
     * Executes a command against a node
     */
    protected execCmd(node: TSpec, command: string): Promise<void>{

        // @TODO better handling of child error

        return new Promise<void>((resolve, reject)=>{

            Logger.info(`\tOPEN [${node.name}] ${command}`, { color: "whiteBright"});

            let childStart: number = Date.now();
            var child = exec(command, {
                cwd: dirname(node.path)
            });
            child.stdout.on('data', this.getProcessLogger("info", node.name));
            
            child.stderr.on('data', this.getProcessLogger("error", node.name));

            child.on('close', function(code) {
                // Depending on code ... reject or resolve and display info
                Logger.info(`\tCLOSE [${node.name}] ${command} , code : ${code} / ${Date.now() - childStart} ms`, { color: "whiteBright"});
                
                resolve();
                
            });
        });
    }

    protected async triggerCommand( spec: TSpec, 
                                command: string | ((node: TSpec, index:number, collection: TSpec[]) => Promise<void>),
                                options: TExecutionOptions ): Promise<void> {
                                            
        let orderedNodes: TSpec[][] = 
            await this.getSpecsInOrder(spec, options);

        for(var i = 0; i< orderedNodes.length; i++) {

            // @TODO better handling of child error
            //       IDEA: if a node errors, just stop process only
            //              of the dependencies of that node but allow
            //              other part of the tree to continue
            await Promise.all( orderedNodes[i].map((node: TSpec, index: number, col: TSpec[]) => {

                if(node.isVirtual){
                    return;
                }

                if(typeof command == "string"){
                    return this.execCmd(node, command as string);
                } else {
                    return command(node, index, col);
                }
            }));

        }
    }

    /**
     * Returns a list of Spec to treat.
     * The list order will depend on the passed options.
     */
    protected async getSpecsInOrder(root: TSpec, options: TExecutionOptions): Promise<TSpec[][]> {
        let results: TSpec[][] = [];

        // get grouped dependencies
        let grouped = await this.getGroupedDependencies(root);

        // a high level means a higher priority
        results = Object.keys( grouped )
            .sort( (a, b)=>{ return (+a) - (+b); })
            .reverse()
            .map(k => grouped[k].sort((n1, n2)=>{ return n1.name.localeCompare(n2.name);}));

        // if options is a tree,
        if((<TTreeExecOptions>options).tree){

            if((<TTreeExecOptions>options).tree.parallel){
                // Tree with options to parallelize siblings
                return results;
            }

            // Tree with options to sequentialize stuff
            // flatten previous result
            let newResults: TSpec[][] = [];

            results.forEach((result)=>{
                result.forEach((r)=>{
                    newResults.push([r]);
                });
            });

            return newResults;
        }
        
        // Willing to exec all
        if((<TAllExecOptions>options).all){
            let uniqueCell: TSpec[] = [],
                newResults: TSpec[][] = [uniqueCell];

            if((<TAllExecOptions>options).all.parallel){
                // Parallelize all without paying attention to relations
                results.forEach((result) => {
                    result.forEach((r)=>{
                        uniqueCell.push(r);
                    });
                });

                return newResults;
            }

            // Sequentialize all without paying attention to relations
            // flatten previous result
            
            results.forEach((result)=>{
                result.forEach((r)=>{
                    newResults.push([r]);
                });
            });

            return newResults;
        }

        return results;   
    }

    /**
     * Organizes dependencies by level.
     * Each level represents a group of dependencies without link between them.
     * A lower level is dependent on a higher level.
     */
    private async getGroupedDependencies(root: TSpec): Promise<{ [level: string]: TSpec[]; }> {
        let grouped: { [level:string]: TSpec[]; } = {};
        let nodeByLevel: { [name: string]: number; } = {};
        
        // check grouped entry existence
        let checkGroupedArrayAndPush = (node: TSpec, level: number)=>{
            if(!grouped[level]) {
                grouped[level] = [];
            }
            grouped[level].push(node);
        };

        // Move a node and its dependencies to a new level
        // removing them from their former level
        let swap = async (node, newLevel)=>{
            
            let performSwap = (node, newLevel) => {
                let formerNodeLevel = nodeByLevel[node.name];

                if(formerNodeLevel >= newLevel){
                    return;
                }
                
                let idx = grouped[ formerNodeLevel ].findIndex(v => v.name == node.name );
                grouped[ formerNodeLevel ].splice(idx, 1);
                
                nodeByLevel[ node.name ] = newLevel;
        
                checkGroupedArrayAndPush(node, newLevel);
            };
            
            // use another dfs to move dependencies downwards too
            let anotherDfs = new DepthFirstSearch<TSpec>({ 
                getNodeHash: this.nodeHasher,
                adjacentNodeGetter: this.dependenciesRetriever,
                processNode: async (node: TSpec) => {
                    // nothing
                },
                processEdge: async (parent: TSpec, node: TSpec) => {
                    performSwap(node, nodeByLevel[parent.name] + 1);
                }
            });

            await anotherDfs.perform(node);
        };

        // Use a DFS algorithm to make parallelizable groups
        let dfs = new DepthFirstSearch<TSpec>({ 
                getNodeHash: this.nodeHasher,
                adjacentNodeGetter: this.dependenciesRetriever,
                processNode: async (node: TSpec) => {
                    // nothing
                },
                processEdge: async (parent: TSpec, node: TSpec, level: number) => {
                    
                    if(!nodeByLevel[parent.name]){
                        nodeByLevel[parent.name] = 1;
                        checkGroupedArrayAndPush(parent, nodeByLevel[parent.name]);
                    }

                    if(!nodeByLevel[node.name]){
                        nodeByLevel[node.name] = nodeByLevel[parent.name] + 1;
                        checkGroupedArrayAndPush(node, nodeByLevel[node.name]);
                    }
                    else {
                        let formerLevel = nodeByLevel[node.name];
                        let newLevel = nodeByLevel[parent.name] + 1;
                        if(newLevel > formerLevel){
                            await swap(node, newLevel);
                        }
                    }
                }
            });

        await dfs.perform(root);

        return grouped;
    }

    /**
     * Generates a logger which sanitizes a process output
     * before logging it
     */
    protected getProcessLogger(level: "error" | "info", prefix: string) {

        return (msg) => {
            let splitted: string[] = msg.toString()
                                        .split(/[\r\n]+/)
                                        .map(s => `\t  [${prefix}] ${s}`);

            splitted.forEach(s => Logger.log(s, level, {color: "greenBright" }));
        };
    }
    
}