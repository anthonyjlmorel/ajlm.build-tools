import { RepositorySpecsReader, TSpec } from "./repository-specs-reader";
import { resolve, join, dirname } from "path";
import { ParametersGetter, TCommandLineParameters } from 'ajlm.utils';
import { TreeExecutor } from './tree-executor';

// module entry point


// build all

// push all (git based)

let rsr = new RepositorySpecsReader();

let param: TCommandLineParameters = (new ParametersGetter()).getParameters();

if(param["exec"] && param["target"]){
    let action: string = param["exec"];
    let pck: string = param["target"];


    rsr.getPackageCompilationSpec(resolve(pck))
    .then((specs)=>{

        (new TreeExecutor()).executeCommand(specs, action);

    });

}
