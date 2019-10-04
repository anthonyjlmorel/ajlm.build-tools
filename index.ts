
import { ParametersGetter, TCommandLineParameters } from 'ajlm.utils';
import { TreeBuilder } from "./tree-builder";
import { Logger } from './logger';
import { TreeExecutor, TExecutionOptions, TTreeExecOptions, TAllExecOptions } from './tree-executor';
import { TSpec } from 'repository-specs-reader';
import { Configuration, DefaultConfiguration } from './configuration';

// Init Conf
// @TODO can we imagine making this customizable as a sub package basis ?
Configuration.getInstance().initialize( DefaultConfiguration.defaultCfg );

// module entry point

let actionsMap: { [actionKey: string] : (param: TCommandLineParameters, options: TExecutionOptions) => Promise<void>;} = {

    "build_pkg" : async (param: TCommandLineParameters, options: TExecutionOptions) => {
        let pck: string = param["pkg"];
        let tb: TreeBuilder = new TreeBuilder();
        await tb.buildPackage(pck, options);
    },

    "build_repo" : async (param: TCommandLineParameters, options: TExecutionOptions) => {
        let pck: string = param["repo"];
        let tb: TreeBuilder = new TreeBuilder();
        options.forceAll = param["forceAll"] != undefined;
        await tb.buildRepository(pck, options);
    },

    "exec_pkg": async (param: TCommandLineParameters, options: TExecutionOptions) => {
        let pck: string = param["pkg"];
        let cmd: string = param["exec"];

        let tc = new TreeExecutor();
        
        await tc.execCmdOnPackage(pck, cmd, options);
    },

    "exec_repo": async (param: TCommandLineParameters, options: TExecutionOptions) => {
        let pck: string = param["repo"];
        let cmd: string = param["exec"];

        let tc = new TreeExecutor();
        
        await tc.execCmdOnRepository(pck, cmd, options);
    },

    "enum_repo": async (param: TCommandLineParameters, options: TExecutionOptions) => {
        let pck: string = param["repo"];

        let tc = new TreeExecutor();
        
        await tc.execCmdOnRepository(pck, getNodeEnumerator(options), options);
    },

    "enum_pkg": async (param: TCommandLineParameters, options: TExecutionOptions) => {
        let pkg: string = param["pkg"];

        let tc = new TreeExecutor();
        
        await tc.execCmdOnPackage(pkg, getNodeEnumerator(options), options);
    }
};

let param: TCommandLineParameters = (new ParametersGetter()).getParameters();

// Return a method that enumerate package names
// Depending on exec options, print delimiters for grouped nodes
let getNodeEnumerator: (options: TExecutionOptions) => (node: TSpec, index: number, group: TSpec[])=> Promise<void> = 
(options: TExecutionOptions) => {
    let isGrouped: boolean = false;
    
    if((<TTreeExecOptions>options).tree){
        isGrouped = true;
    }

    return async (node: TSpec, index: number, group: TSpec[]) => {
        
        if(isGrouped && index == 0){
            Logger.info(`** Group`);
        }
        Logger.info(`\t${node.name}`);
        if(isGrouped && index == group.length - 1){
            Logger.info(`** End`);
        }
    };
};

// Wrapper to know how much time we spent
let execute = async ( cb: (param: TCommandLineParameters, options: TExecutionOptions) => Promise<void>, options: TExecutionOptions ) => {
    Logger.info(`Starting tasks`);
    let now: number = Date.now();
    await cb(param, options);
    Logger.info(`Executed in ${Date.now() - now} ms`);
};

// Find out which request to fill
let fetchCommandLine = async () => {
    for(var key in actionsMap){
        let keys: string[] = key.split("_");
        let action = actionsMap[key];
        let options: TExecutionOptions = {
            tree: {
                parallel: true
            }
        };
        let presentKeys = keys.filter(k => param[k] != undefined);
    
        if(presentKeys.length == keys.length) {

            if(param["all"]){
                options = {
                    all: {
                        parallel: param["parallel"] ? true : false
                    }
                };
            }
            else if(param["tree"]){
                options = {
                    tree: {
                        parallel: param["parallel"] ? true : false
                    }
                };
                
            }

            await execute(action, options);
            return;
        }
    }

    throw new Error("Cannot Work with inputs");
};

// Start
fetchCommandLine()
    .catch((error)=>{
        Logger.error(" -> Stopped due to error");
    });