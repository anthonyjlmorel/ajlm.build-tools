import { TSpec, RepositorySpecsReader, TRepositorySpecs } from './repository-specs-reader';
import { BreadthFirstSearch, TreeTraversalType } from 'ajlm.utils';
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
        let grouped: { [key:string]: TSpec[]; } = {};
        let nodeByLevel: { [name: string]: number; } = {};
        let results: TSpec[][] = [];
        
        // Use a BFS algorithm to make parallelizable groups
        let pushNodeInLevel = async (node: TSpec, level: number) => {
                
                if(!grouped[ level ]){
                    grouped[ level ] = [];
                }

                let formerLevel = nodeByLevel[ node.name ];

                if(formerLevel === undefined){
                    grouped[ level ].push(node);
                    nodeByLevel[ node.name ] = level;

                } else if(formerLevel < level) {
                   
                    // Swapping this node and its dependencies
                    let swap = (node, newLevel)=>{
                        
                        let formerNodeLevel = nodeByLevel[node.name];
                        nodeByLevel[ node.name ] = newLevel;

                        if(formerNodeLevel !== undefined){
                            let idx = grouped[ formerNodeLevel ].findIndex(v => v.name == node.name );
                            grouped[ formerNodeLevel ].splice(idx, 1);
                        }
                    
                        if(!grouped[newLevel]){ grouped[newLevel] = []; }
                        grouped[ newLevel ].push(node);

                    };
                    
                    let anotherBfs = new BreadthFirstSearch({ 
                        getNodeHash: this.nodeHasher,
                        adjacentNodeGetter: this.dependenciesRetriever,
                        processNode: async (node: TSpec) => {
                            // nothing
                        },
                        processEdge: async (parent: TSpec, node: TSpec, currentLevel: number) => {
                            swap(node, level + currentLevel);
                        }
                    });

                    swap(node, level);

                    await anotherBfs.perform(node, TreeTraversalType.PreOrder);
                }
            },
            bfs = new BreadthFirstSearch({ 
                getNodeHash: this.nodeHasher,
                adjacentNodeGetter: this.dependenciesRetriever,
                processNode: async (node: TSpec) => {
                    // nothing
                },
                processEdge: async (parent: TSpec, node: TSpec, level: number) => {
                    await pushNodeInLevel(parent, level - 1);
                    await pushNodeInLevel(node, level);
                }
            });

        await bfs.perform(root, TreeTraversalType.PreOrder);

        // a high level means a higher priority in a BFS
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