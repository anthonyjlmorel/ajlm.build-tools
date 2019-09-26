
import { resolve, join, dirname } from "path";
import { ParametersGetter, TCommandLineParameters } from 'ajlm.utils';
import { TreeBuilder } from "./tree-builder";
import { Logger } from './logger';
import { TreeExecutor } from './tree-executor';
import { TSpec } from 'repository-specs-reader';


// module entry point

let actionsMap: { [actionKey: string] : (param: TCommandLineParameters) => Promise<void>;} = {

    "build_pkg" : async (param: TCommandLineParameters) => {
        let pck: string = param["pkg"];
        let tb: TreeBuilder = new TreeBuilder();
        await tb.buildPackage(pck);
    },

    "build_repo" : async (param: TCommandLineParameters) => {
        let pck: string = param["repo"];
        let tb: TreeBuilder = new TreeBuilder();
        await tb.buildRepository(pck, param["forceAll"] == "true");
    },

    "exec_pkg": async (param: TCommandLineParameters) => {
        let pck: string = param["pkg"];
        let cmd: string = param["exec"];

        let tc = new TreeExecutor();
        
        await tc.execCmdOnPackage(pck, cmd);
    },

    "exec_repo": async (param: TCommandLineParameters) => {
        let pck: string = param["repo"];
        let cmd: string = param["exec"];

        let tc = new TreeExecutor();
        
        await tc.execCmdOnRepository(pck, cmd);
    },

    "enum_repo": async (param: TCommandLineParameters) => {
        let pck: string = param["repo"];

        let tc = new TreeExecutor();
        
        let options = {
            "parallel" : param["parallel"] ? true : false
        };
        
        await tc.execCmdOnRepository(pck, async (node: TSpec)=>{
            Logger.info(node.name);
        }, options);
    },

    "enum_pkg": async (param: TCommandLineParameters) => {
        let pkg: string = param["pkg"];

        let tc = new TreeExecutor();
        let options = {
            "parallel" : param["parallel"] ? true : false
        };
        
        await tc.execCmdOnPackage(pkg, async (node: TSpec)=>{
            Logger.info(node.name);
        }, options);
    }
};

let param: TCommandLineParameters = (new ParametersGetter()).getParameters();

// Wrapper to know how much time we spent
let execute = async ( cb: (param: TCommandLineParameters) => Promise<void> ) => {
    Logger.info(`Starting tasks`);
    let now: number = Date.now();
    await cb(param);
    Logger.info(`Executed in ${Date.now() - now} ms`);
};

// Find out which request to fill
let fetchCommandLine = async () => {
    for(var key in actionsMap){
        let keys: string[] = key.split("_");
        let action = actionsMap[key];
    
        let presentKeys = keys.filter(k => param[k] != undefined);
    
        if(presentKeys.length == keys.length){
            await execute(action);
            return;
        }
    }

    throw new Error("Cannot Work with inputs");
};

// Start
fetchCommandLine()
    .catch((error)=>{
        Logger.error(error.toString());
    });



// @TODO
// build all

// push all (git based)