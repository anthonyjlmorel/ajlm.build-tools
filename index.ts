
import { resolve, join, dirname } from "path";
import { ParametersGetter, TCommandLineParameters } from 'ajlm.utils';
import { TreeBuilder } from "./tree-builder";
import { Logger } from './logger';
import { TreeExecutor } from './tree-executor';
import { TSpec } from 'repository-specs-reader';


// module entry point


// build all

// push all (git based)

let param: TCommandLineParameters = (new ParametersGetter()).getParameters();
let tb: TreeBuilder = new TreeBuilder();

let execute = async ( cb: () => Promise<void> ) => {

    let now: number = Date.now();
    await cb();
    Logger.info(`Executed in ${Date.now() - now} ms`);
};

if(param["build"] && param["target"]) {
    
    execute( async () => {
        let pck: string = param["target"];
        await tb.buildPackage(pck);
    });
    
}

if(param["buildAll"] && param["target"]) {

    execute( async () => {
        let pck: string = param["target"];
        await tb.buildRepository(pck, param["forceAll"]);
    });
    
}

if(param["exec"] && param["target"]) {

    execute( async () => {
        let pck: string = param["target"];
        let cmd: string = param["exec"];

        let tc = new TreeExecutor();
        
        await tc.execCmdOnPackage(pck, cmd);
    });
    
}

if(param["execAll"] && param["target"]) {

    execute( async () => {
        let pck: string = param["target"];
        let cmd: string = param["execAll"];

        let tc = new TreeExecutor();
        
        await tc.execCmdOnRepository(pck, cmd);
    });
    
}

if(param["enum"] && param["target"]) {

    execute( async () => {
        let pck: string = param["target"];

        let tc = new TreeExecutor();
        
        await tc.execCmdOnRepository(pck, async (node: TSpec)=>{
            Logger.info(node.name);
        });
    });
    
}
