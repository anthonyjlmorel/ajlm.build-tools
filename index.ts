
import { resolve, join, dirname } from "path";
import { ParametersGetter, TCommandLineParameters } from 'ajlm.utils';
import { TreeBuilder } from "./tree-builder";


// module entry point


// build all

// push all (git based)

let param: TCommandLineParameters = (new ParametersGetter()).getParameters();

if(param["exec"] && param["target"]){
    let action: string = param["exec"];
    let pck: string = param["target"];

    
    new TreeBuilder().build(pck);

}
