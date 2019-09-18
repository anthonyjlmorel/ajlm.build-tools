
import { readFile as formerReadFile } from "fs";
import { promisify } from "util";
import * as glob from "glob";
import { DepthFirstSearch } from "ajlm.utils";

let readFile = promisify(formerReadFile);

type ObjectLiteral = { [key: string]: any; };

export type TSpec = {
    name: string;
    pkg: ObjectLiteral; // package.json file

};

export type TRepositorySpecs = {
    packagesMap: { [pkgName: string]: TSpec; };
    packagesTrees: TSpec[];
};

export class RepositorySpecsReader {


    public async getRepositoryPackages(repositoryPath: string): Promise<TRepositorySpecs> {
        let pkgFiles: string[] = await this.getPackagesFilesList(repositoryPath);


    }


    private getPackagesFilesList(repoPath: string): Promise<string[]> {
        
        return new Promise<string[]>((resolve, reject)=>{
            glob("**/**/package.json", {
                cwd: repoPath,
                absolute: true
            }, (err, files)=>{
                if(err){
                    reject(err);
                } else {
                    resolve(files);
                }
            });
        });
        

    }

}