import { TSpec, RepositorySpecsReader } from './repository-specs-reader';
import { MapBasedDepthFirstSearch, TreeTraversalType } from 'ajlm.utils';
import { resolve, dirname } from 'path';
import { Logger } from './logger';
import { exec } from 'child_process';

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
            new MapBasedDepthFirstSearch<TSpec>(this.dependenciesRetriever, this.nodeHasher);

    /**
     * Executor of action against dependants
     */
    protected dependantsDfs: MapBasedDepthFirstSearch<TSpec> = 
            new MapBasedDepthFirstSearch<TSpec>(this.dependantsRetriever, this.nodeHasher);

    constructor( ) {
    }

    public async execCmdOnRepository(packageJson: string, command: string | ((node: TSpec) => Promise<void>)): Promise<void> {
        let repo = await this.rsr.getRepositoryPackages(resolve(packageJson));

        let processedNodes: { [name: string]: TSpec; } = {};
        
        for(var i=0; i<repo.rootTrees.length; i++){
            Logger.info(" *************** ");
            await this.execCmdOnPackage(repo.rootTrees[i], async (node: TSpec)=>{
                if( processedNodes[ node.name ] ){
                    return;
                }

                processedNodes[ node.name ] = node;

                if(typeof command == "string"){
                    await this.execCmd(node, command as string);
                } else {
                    await command(node);
                }
                
            });

        }
    }

    /**
     * Executes an action on each node following a DFS algorithm
     */
    public async execCmdOnPackage( packageJson: string | TSpec, command: string | ((node: TSpec) => Promise<void>) ): Promise<void>{
        let specs: TSpec;
        
        if(typeof packageJson == "string"){
            specs = await this.rsr.getPackageCompilationSpec(resolve(<string>packageJson));
        } else {
            specs = <TSpec>packageJson;
        }

        await this.dependenciesDfs.perform(specs, async (node: TSpec) => {

            if(typeof command == "string"){
                await this.execCmd(node, command as string);
            } else {
                await command(node);
            }
            

        }, TreeTraversalType.PostOrder);
    }

    /**
     * Executes a command against a node
     */
    protected execCmd(node: TSpec, command: string): Promise<void>{

        return new Promise<void>((resolve, reject)=>{

            Logger.info(`\t**** Exec ${command} on ${node.name}`, { color: "whiteBright"});

            let childStart: number = Date.now();
            var child = exec(command, {
                cwd: dirname(node.path)
            });
            child.stdout.on('data', this.getProcessLogger("info"));
            
            child.stderr.on('data', this.getProcessLogger("error"));

            child.on('close', function(code) {
                // Depending on code ... reject or resolve and display info
                Logger.info(`\t**** End of ${command} on ${node.name}, code : ${code} / ${Date.now() - childStart} ms`, { color: "whiteBright"});
                
                resolve();
                
            });
        });
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