import { TSpec } from 'repository-specs-reader';
import { MapBasedDepthFirstSearch, TreeTraversalType } from 'ajlm.utils';

export class TreeExecutor {

    public async execute( rootNode: TSpec, callback: (node: TSpec) => Promise<void> ): Promise<void>{

        let dfs = new MapBasedDepthFirstSearch( async (node: TSpec)=>{
            return Object.keys(node.dependencies).map(d => node.dependencies[d]);
        }, async (node: TSpec)=>{ return node.name; } );


        await dfs.perform(rootNode, callback, TreeTraversalType.PostOrder);
    }

}