import { RepositorySpecsReader, TSpec } from "./repository-specs-reader";
import { resolve, join, dirname } from "path";
import { ParametersGetter, TCommandLineParameters } from 'ajlm.utils';
import { TreeExecutor } from './tree-executor';

import { exec } from "child_process";

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

        (new TreeExecutor()).execute(specs, async (node: TSpec)=>{
            return new Promise<void>((resolve, reject)=>{

                var child = exec(action, {
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

    });

}
