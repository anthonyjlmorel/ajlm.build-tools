import { TSpec } from 'repository-specs-reader';
import { MapBasedDepthFirstSearch, TreeTraversalType } from 'ajlm.utils';
import { exec } from 'child_process';
import { dirname } from 'path';

export class TreeExecutor {

    private readonly adjacentNodeReader: (node: TSpec)=> Promise<TSpec[]> = async (node: TSpec)=>{
        return Object.keys(node.dependencies).map(d => node.dependencies[d]);
    };

    private readonly nodeHash: (node: TSpec) => Promise<string> = async (node: TSpec)=>{ return node.name; };

    /**
     * Executes an action on each node following a DFS algorithm
     */
    public async executeAction( rootNode: TSpec, callback: (node: TSpec) => Promise<void> ): Promise<void>{

        let dfs = new MapBasedDepthFirstSearch( this.adjacentNodeReader, this.nodeHash );
        await dfs.perform(rootNode, callback, TreeTraversalType.PostOrder);
    }

    /**
     * Executes a command line in each package folder following a DFS algorithm
     */
    public async executeCommand(rootNode: TSpec, command: string): Promise<void> {
        
        // @TODO improve logging ...
        
        return this.executeAction(rootNode, async (node: TSpec)=>{
            return new Promise<void>((resolve, reject)=>{

                var child = exec(command, {
                    cwd: dirname(node.path)
                });
                child.stdout.on('data', function(data) {
                    console.log('stdout: ' + data);
                });
                child.stderr.on('data', function(data) {
                    console.log('stderr: ' + data);
                });
                child.on('close', function(code) {
                    // Depending on code ... reject or resolve and display info
                    console.log('closing code: ' + code);
                    resolve();
                });
            });
        });
    }
}