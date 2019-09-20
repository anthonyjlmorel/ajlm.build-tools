import { TSpec } from 'repository-specs-reader';
import { MapBasedDepthFirstSearch, TreeTraversalType } from 'ajlm.utils';
import { exec } from 'child_process';
import { dirname } from 'path';
import { Logger } from './logger';

export class TreeExecutor {

    private readonly adjacentNodeReader: (node: TSpec)=> Promise<TSpec[]> = async (node: TSpec)=>{
        return Object.keys(node.dependencies).map(d => node.dependencies[d]);
    };

    private readonly nodeHash: (node: TSpec) => Promise<string> = async (node: TSpec)=>{ return node.name; };

    /**
     * Executes an action on each node following a DFS algorithm
     */
    public async executeAction( rootNode: TSpec, callback: (node: TSpec, parent: TSpec, depth: number) => Promise<void> ): Promise<void>{

        let dfs = new MapBasedDepthFirstSearch( this.adjacentNodeReader, this.nodeHash );
        await dfs.perform(rootNode, callback, TreeTraversalType.PostOrder);
    }

    /**
     * Executes a command line in each package folder following a DFS algorithm
     */
    public async executeCommand(rootNode: TSpec, command: string): Promise<void> {
        
        let cmdStart: number = Date.now();
        await this.executeAction(rootNode, async (node: TSpec, parent: TSpec, depth: number)=>{
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
        });

        Logger.log(`End Of command in ${Date.now() - cmdStart} ms`);
        
        
    }
}