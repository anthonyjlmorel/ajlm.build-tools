import { ConfigurationHolder } from 'ajlm.utils';

/**
 * Defines configuration object for tool
 */
export type TConfiguration = {
    glob: {
        ignore: string[];                           // ignore entries of glob
    },
    build: {
        
        script: "build",                            // npm script to call for building

        forceDependantsRebuildOnChange: boolean;    //  On a package build due to hash diff, tell if we force
                                                    //  dependant rebuild too
        hash: {
            excludedFolders: string[];              // excluded folders from hash
            excludedFiles: string[];                // included files from hash
            hashFileName: string;                   // hash file name
        }
    }
};

/**
 * Configuration holder
 */
export class Configuration extends ConfigurationHolder<TConfiguration> {

    private static instance: Configuration;

    public static getInstance(): Configuration {
        if(!Configuration.instance){
            Configuration.instance = new Configuration();
        }

        return Configuration.instance;
    }

    public initialize(cfg: TConfiguration, defaultCfg?: TConfiguration): void {
        super.initialize(cfg, defaultCfg);
    }
}

/**
 * Default Cfg
 */
export class DefaultConfiguration {

    public static readonly defaultCfg: TConfiguration = {
            glob: {
                ignore: ["**/node_modules/**",
                            "**/dist/**",
                            "**/bin/**",
                            "**/lib/**",
                            "**/bundle/**",
                            "**/logs/**",
                            "**/cfg/**"]
            },
            build: {
                forceDependantsRebuildOnChange: true,
                script: "build",
                hash: {
                    excludedFiles: [".*"],
                    excludedFolders: [".*", 
                                        "node_modules", 
                                        "dist", 
                                        "lib", 
                                        "bundle", 
                                        "logs"],
                    hashFileName: ".hash"
                }
            }
        };
}