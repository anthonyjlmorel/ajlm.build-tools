import { TSpec, RepositorySpecsReader, TRepositorySpecs } from './repository-specs-reader';
import { MapBasedDepthFirstSearch, BreadthFirstSearch } from 'ajlm.utils';
import { resolve, dirname } from 'path';
import { Logger } from './logger';
import { exec } from 'child_process';

type TTreeExecOptions = {
    tree: {
        parallel?: boolean;
    }
};

type TAllExecOptions = {
    all: {
        parallel?: boolean;
    }
};

export type TExecutionOptions = { forceAll?:boolean; } & (TTreeExecOptions | TAllExecOptions);

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

    /**
     * Executor of action against dependencies
     */
    protected dependenciesDfs: MapBasedDepthFirstSearch<TSpec> = 
            new MapBasedDepthFirstSearch<TSpec>(this.dependenciesRetriever);

    /**
     * Executor of action against dependants
     */
    protected dependantsDfs: MapBasedDepthFirstSearch<TSpec> = 
            new MapBasedDepthFirstSearch<TSpec>(this.dependantsRetriever);

    constructor( ) {
    }

    public async execCmdOnRepository(packageJson: string, 
                                    command: string | ((node: TSpec) => Promise<void>),
                                    options?: TExecutionOptions): Promise<void> {
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
                                  command: string | ((node: TSpec) => Promise<void>),
                                  options?: TExecutionOptions ): Promise<void>{
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

        return new Promise<void>((resolve, reject)=>{

            Logger.info(`\tOPEN [${node.name}] ${command}`, { color: "whiteBright"});

            let childStart: number = Date.now();
            var child = exec(command, {
                cwd: dirname(node.path)
            });
            child.stdout.on('data', this.getProcessLogger("info"));
            
            child.stderr.on('data', this.getProcessLogger("error"));

            child.on('close', function(code) {
                // Depending on code ... reject or resolve and display info
                Logger.info(`\tCLOSE [${node.name}] ${command} , code : ${code} / ${Date.now() - childStart} ms`, { color: "whiteBright"});
                
                resolve();
                
            });
        });
    }

    protected async triggerCommand( spec: TSpec, 
                                command: string | ((node: TSpec) => Promise<void>),
                                options: TExecutionOptions ): Promise<void> {
                                            
        let orderedNodes: TSpec[][] = 
            await this.getSpecsInOrder(spec, options);

        for(var i = 0; i< orderedNodes.length; i++) {

            await Promise.all( orderedNodes[i].map((node: TSpec)=>{

                if(node.isVirtual){
                    return;
                }

                if(typeof command == "string"){
                    return this.execCmd(node, command as string);
                } else {
                    return command(node);
                }
            }));

        }
    }

    protected async getSpecsInOrder(root: TSpec, options: TExecutionOptions): Promise<TSpec[][]> {
        let grouped: { [key:string]: TSpec[]; } = {};
        let nodeByLevel: { [name: string]: number; } = {};
        let results: TSpec[][] = [];
        
        let bfs = new BreadthFirstSearch(this.dependenciesRetriever);
        await bfs.perform(root, async (node: TSpec, parent: TSpec, level: number)=>{

            if(!grouped[ level ]){
                grouped[ level ] = [];
            }

            let formerLevel = nodeByLevel[ node.name ];

            if(formerLevel === undefined){
                
                grouped[ level ].push(node);
                nodeByLevel[ node.name ] = level;

            } else if(formerLevel < level) {

                nodeByLevel[ node.name ] = level;
                let idx = grouped[ formerLevel ].findIndex(v => v.name == node.name );
                grouped[ formerLevel ].splice(idx, 1);

                grouped[ level ].push(node);

            }
            
        });

        // a high level means a higher priority in a BFS
        results = Object.keys( grouped )
            .sort( (a, b)=>{ return (+a) - (+b); })
            .reverse()
            .map(k => grouped[k].sort((n1, n2)=>{ return n1.name.localeCompare(n2.name);}));
        
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
     * Generates a logger which sanitize a process output
     * before logging it
     */
    protected getProcessLogger(level: "error" | "info") {

        return (msg) => {
            let splitted: string[] = msg.toString()
                                        .split(/[\r\n]+/)
                                        .map(s => `\t\t${s}`);

            splitted.forEach(s => Logger.log(s, level, {color: "greenBright" }));
        };
    }
    
}